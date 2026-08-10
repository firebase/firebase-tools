import { expect } from "chai";
import * as sinon from "sinon";
import * as path from "path";
import * as fs from "fs-extra";

import {
  command,
  parseNpmPackageSpecifier,
  validateNpmPackageName,
  sanitizePackageNameToKitName,
  isThirdPartyPackage,
  checkPackageHasShrinkwrap,
} from "./functions-kits-install";
import * as experiments from "../experiments";
import * as initSpawn from "../init/spawn";
import { Config } from "../config";
import { FirebaseError } from "../error";
import * as prompt from "../prompt";

describe("functions:kits:install", () => {
  let assertEnabledStub: sinon.SinonStub;
  let wrapSpawnStub: sinon.SinonStub;
  let spawnWithOutputStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = [];
    sinon.stub(command, "prepare").resolves();
    assertEnabledStub = sinon.stub(experiments, "assertEnabled");
    wrapSpawnStub = sinon.stub(initSpawn, "wrapSpawn").resolves();
    spawnWithOutputStub = sinon
      .stub(initSpawn, "spawnWithOutput")
      .resolves(JSON.stringify([{ hasShrinkwrap: true }]));
    sinon.stub(fs, "ensureDir").resolves();
    sinon.stub(fs, "pathExists").resolves(false);
    sinon.stub(fs, "readJson").resolves({});
    sinon.stub(fs, "writeJson").resolves();
    sinon.stub(fs, "writeFile").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("validateNpmPackageName", () => {
    it("should accept valid unscoped package names", () => {
      expect(() => validateNpmPackageName("my-kit")).to.not.throw();
      expect(() => validateNpmPackageName("firestore-export")).to.not.throw();
      expect(() => validateNpmPackageName("kit_123.v1")).to.not.throw();
    });

    it("should accept valid scoped package names with exactly one slash", () => {
      expect(() =>
        validateNpmPackageName("@firebase-functions-kits/firestore-bigquery-export"),
      ).to.not.throw();
      expect(() => validateNpmPackageName("@invertase/example-kit")).to.not.throw();
    });

    it("should reject package names with multiple slashes", () => {
      expect(() => validateNpmPackageName("@scope/pkg/extra")).to.throw(
        FirebaseError,
        /Invalid NPM package name/,
      );
      expect(() => validateNpmPackageName("foo/bar/baz")).to.throw(
        FirebaseError,
        /Invalid NPM package name/,
      );
    });

    it("should reject unscoped package names containing slashes", () => {
      expect(() => validateNpmPackageName("foo/bar")).to.throw(
        FirebaseError,
        /Invalid NPM package name/,
      );
    });

    it("should reject empty or malformed package names", () => {
      expect(() => validateNpmPackageName("")).to.throw(FirebaseError, /Invalid NPM package name/);
      expect(() => validateNpmPackageName("@scope")).to.throw(
        FirebaseError,
        /Invalid NPM package name/,
      );
      expect(() => validateNpmPackageName("a".repeat(215))).to.throw(
        FirebaseError,
        /Invalid NPM package name/,
      );
    });
  });

  describe("parseNpmPackageSpecifier", () => {
    it("should parse scoped package with version", () => {
      const res = parseNpmPackageSpecifier(
        "@firebase-functions-kits/firestore-bigquery-export@1.0.0",
      );
      expect(res).to.deep.equal({
        packageName: "@firebase-functions-kits/firestore-bigquery-export",
        version: "1.0.0",
      });
    });

    it("should parse scoped package with release candidate version", () => {
      const res = parseNpmPackageSpecifier(
        "@firebase-functions-kits/firestore-bigquery-export@1.0.0-rc.1",
      );
      expect(res).to.deep.equal({
        packageName: "@firebase-functions-kits/firestore-bigquery-export",
        version: "1.0.0-rc.1",
      });
    });

    it("should parse scoped package with tag", () => {
      const res = parseNpmPackageSpecifier(
        "@firebase-functions-kits/firestore-bigquery-export@latest",
      );
      expect(res).to.deep.equal({
        packageName: "@firebase-functions-kits/firestore-bigquery-export",
        version: "latest",
      });
    });

    it("should parse scoped package without version", () => {
      const res = parseNpmPackageSpecifier("@firebase-functions-kits/firestore-bigquery-export");
      expect(res).to.deep.equal({
        packageName: "@firebase-functions-kits/firestore-bigquery-export",
      });
    });

    it("should parse non-scoped package with version", () => {
      const res = parseNpmPackageSpecifier("my-kit@^2.0.0");
      expect(res).to.deep.equal({
        packageName: "my-kit",
        version: "^2.0.0",
      });
    });

    it("should parse non-scoped package with tag", () => {
      const res = parseNpmPackageSpecifier("my-kit@next");
      expect(res).to.deep.equal({
        packageName: "my-kit",
        version: "next",
      });
    });

    it("should parse non-scoped package without version", () => {
      const res = parseNpmPackageSpecifier("my-kit");
      expect(res).to.deep.equal({
        packageName: "my-kit",
      });
    });
  });

  describe("sanitizePackageNameToKitName", () => {
    it("should extract kit name from scoped package name", () => {
      expect(
        sanitizePackageNameToKitName("@firebase-functions-kits/firestore-bigquery-export"),
      ).to.equal("firestore-bigquery-export");
      expect(sanitizePackageNameToKitName("@foo/bar")).to.equal("bar");
    });

    it("should sanitize non-scoped package name", () => {
      expect(sanitizePackageNameToKitName("my-kit")).to.equal("my-kit");
      expect(sanitizePackageNameToKitName("My_Kit!")).to.equal("my_kit");
    });

    it("should truncate long names to 40 characters", () => {
      const longName = "@scope/" + "a".repeat(50);
      expect(sanitizePackageNameToKitName(longName)).to.equal("a".repeat(40));
    });
  });

  describe("isThirdPartyPackage", () => {
    it("should return false for packages under @firebase-functions-kits scope", () => {
      expect(isThirdPartyPackage("@firebase-functions-kits/firestore-bigquery-export")).to.be.false;
    });

    it("should return true for packages outside @firebase-functions-kits scope", () => {
      expect(isThirdPartyPackage("firebase-functions-kits")).to.be.true;
      expect(isThirdPartyPackage("@firebase-function-kits-fake/foo")).to.be.true;
      expect(isThirdPartyPackage("@firebase-functions-kits-fake/foo")).to.be.true;
      expect(isThirdPartyPackage("@other-scope/my-kit")).to.be.true;
      expect(isThirdPartyPackage("third-party-kit")).to.be.true;
    });
  });

  describe("checkPackageHasShrinkwrap", () => {
    it("should return true when npm pack output includes hasShrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ hasShrinkwrap: true }]));
      const res = await checkPackageHasShrinkwrap("@firebase-functions-kits/my-kit");
      expect(res).to.be.true;
    });

    it("should return true when npm pack files list includes npm-shrinkwrap.json", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "npm-shrinkwrap.json" }] }]));
      const res = await checkPackageHasShrinkwrap("@firebase-functions-kits/my-kit");
      expect(res).to.be.true;
    });

    it("should return false when npm-shrinkwrap.json is not in package", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      const res = await checkPackageHasShrinkwrap("@firebase-functions-kits/my-kit");
      expect(res).to.be.false;
    });

    it("should return false when npm pack fails", async () => {
      spawnWithOutputStub.rejects(new Error("npm pack error"));
      const res = await checkPackageHasShrinkwrap("@firebase-functions-kits/my-kit");
      expect(res).to.be.false;
    });
  });

  describe("command action", () => {
    it("should assert that kits experiment is enabled", async () => {
      assertEnabledStub.throws(new FirebaseError("kits experiment disabled"));

      await expect(
        command.runner()({
          npm_package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, "kits experiment disabled");

      expect(assertEnabledStub).to.have.been.calledWith("kits", "install a function kit");
    });

    it("should throw an error if not in a Firebase project directory", async () => {
      await expect(
        command.runner()({
          npm_package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, /firebase.json not found/);
    });

    it("should throw an error if --npm_package is not provided", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => path.join("/mock/project", p),
      } as unknown as Config;

      await expect(
        command.runner()({
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        /set the --npm_package option to a valid NPM package and try again\./,
      );
    });

    it("should throw an error if --npm_package has an invalid package name", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => path.join("/mock/project", p),
      } as unknown as Config;

      await expect(
        command.runner()({
          npm_package: "@scope/pkg/extra@1.0.0",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, /Invalid NPM package name/);
    });

    it("should successfully install a first-party kit into firebase.json", async () => {
      const writtenFiles: Record<string, unknown> = {};

      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      await command.runner()({
        npm_package: "@firebase-functions-kits/firestore-bigquery-export@1.0.0",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
      });

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install"],
        "/mock/project/function-kits/firestore-bigquery-export",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["run", "build"],
        "/mock/project/function-kits/firestore-bigquery-export",
      );

      const pkgJsonResult = writtenFiles[
        "function-kits/firestore-bigquery-export/package.json"
      ] as { name?: string; dependencies?: Record<string, string> };
      expect(pkgJsonResult.name).to.equal("firestore-bigquery-export-wrapper");
      expect(pkgJsonResult.dependencies).to.have.property(
        "@firebase-functions-kits/firestore-bigquery-export",
        "1.0.0",
      );

      expect(writtenFiles["function-kits/firestore-bigquery-export/src/index.ts"]).to.be.a(
        "string",
      );
      expect(
        writtenFiles["function-kits/firestore-bigquery-export/src/index.ts"] as string,
      ).to.include('export * from "@firebase-functions-kits/firestore-bigquery-export";');

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "firestore-bigquery-export",
            sourcePackage: {
              id: "@firebase-functions-kits/firestore-bigquery-export",
            },
            source: "function-kits/firestore-bigquery-export",
            instances: {
              "firestore-bigquery-export":
                "function-kits/firestore-bigquery-export/config-firestore-bigquery-export",
            },
            predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
          },
        ],
      });
    });

    it("should prompt and allow custom kit ID and instance ID", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      sinon
        .stub(prompt, "input")
        .onFirstCall()
        .resolves("my-custom-kit")
        .onSecondCall()
        .resolves("my-instance");

      await command.runner()({
        npm_package: "@firebase-functions-kits/firestore-bigquery-export@1.0.0",
        cwd: "/mock/project",
        config: mockConfig,
      });

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install"],
        "/mock/project/function-kits/my-custom-kit",
      );

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "my-custom-kit",
            sourcePackage: {
              id: "@firebase-functions-kits/firestore-bigquery-export",
            },
            source: "function-kits/my-custom-kit",
            instances: {
              "my-instance": "function-kits/my-custom-kit/config-my-instance",
            },
            predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
          },
        ],
      });
    });

    it("should run npm install with --ignore-scripts for third-party packages", async () => {
      sinon.stub(prompt, "confirm").resolves(true);

      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      await command.runner()({
        npm_package: "@third-party/custom-kit",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
      });

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install", "--ignore-scripts"],
        "/mock/project/function-kits/custom-kit",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["run", "build"],
        "/mock/project/function-kits/custom-kit",
      );
    });

    it("should reject duplicate kit name in firebase.json", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [
            {
              kit: "firestore-bigquery-export",
              source: "function-kits/firestore-bigquery-export",
              instances: {
                inst1: "function-kits/firestore-bigquery-export/config-inst1",
              },
            },
          ],
        },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
      } as unknown as Config;

      await expect(
        command.runner()({
          npm_package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, /functions.kit must be unique/);
    });

    it("should reject instance ID that collides with codebase name", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [
            {
              codebase: "my-kit",
              source: "functions",
            },
          ],
        },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
      } as unknown as Config;

      await expect(
        command.runner()({
          npm_package: "@firebase-functions-kits/my-kit",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, /must be mutually exclusive/);
    });

    it("should reject instance ID that collides with another kit instance ID", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [
            {
              kit: "other-kit",
              source: "function-kits/other-kit",
              instances: {
                "my-kit": "function-kits/other-kit/config-my-kit",
              },
            },
          ],
        },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
      } as unknown as Config;

      await expect(
        command.runner()({
          npm_package: "@firebase-functions-kits/my-kit",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        /functions kit instance ID must be unique across all kits, but 'my-kit' was used more than once/,
      );
    });

    it("should prompt confirmation when a first-party kit lacks npm-shrinkwrap.json", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      await command.runner()({
        npm_package: "@firebase-functions-kits/my-kit",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
      });

      expect(confirmStub).to.have.been.calledOnceWith({
        message:
          "Are you sure you want to install @firebase-functions-kits/my-kit without locked dependencies?",
        default: false,
        nonInteractive: true,
      });
    });

    it("should cancel installation if user declines confirmation for missing shrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      sinon.stub(prompt, "confirm").resolves(false);

      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
      } as unknown as Config;

      await expect(
        command.runner()({
          npm_package: "@firebase-functions-kits/my-kit",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, "Installation cancelled.");
    });
  });
});
