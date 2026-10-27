import { expect } from "chai";
import * as sinon from "sinon";
import * as path from "path";
import * as fs from "fs-extra";

import {
  validateAndResolveDirectoryKit,
  buildAndInstallDirectoryKit,
  createDirectoryAdapter,
} from "./directory";
import * as initSpawn from "../../../init/spawn";
import { Config } from "../../../config";
import { FirebaseError } from "../../../error";
import { ValidatedKitSingle } from "../../projectConfig";

describe("functions/kits/sources/directory", () => {
  let wrapSpawnStub: sinon.SinonStub;
  let statStub: sinon.SinonStub;

  beforeEach(() => {
    wrapSpawnStub = sinon.stub(initSpawn, "wrapSpawn").resolves();
    sinon.stub(fs, "pathExists").resolves(false);
    statStub = sinon.stub(fs, "stat").resolves({ isDirectory: () => true } as fs.Stats);
    sinon.stub(fs, "readJson").resolves({});
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("validateAndResolveDirectoryKit", () => {
    it("should throw if directory is outside of project directory", async () => {
      await expect(
        validateAndResolveDirectoryKit("/mock/project", "../outside-project"),
      ).to.be.rejectedWith(
        FirebaseError,
        "Directory '../outside-project' is outside of project directory. Function kit directory must be inside the project directory.",
      );

      await expect(
        validateAndResolveDirectoryKit("/mock/project", "/other/path/outside"),
      ).to.be.rejectedWith(
        FirebaseError,
        "Directory '/other/path/outside' is outside of project directory. Function kit directory must be inside the project directory.",
      );
    });

    it("should throw if directory does not exist", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/nonexistent").resolves(false);

      await expect(
        validateAndResolveDirectoryKit("/mock/project", "nonexistent"),
      ).to.be.rejectedWith(FirebaseError, "Directory 'nonexistent' does not exist.");
    });

    it("should throw if path is not a directory", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/file.txt").resolves(true);
      statStub
        .withArgs("/mock/project/file.txt")
        .resolves({ isDirectory: () => false } as fs.Stats);

      await expect(validateAndResolveDirectoryKit("/mock/project", "file.txt")).to.be.rejectedWith(
        FirebaseError,
        "Directory 'file.txt' is not a directory.",
      );
    });

    it("should throw if directory does not contain a package.json", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-kit").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves(false);

      await expect(validateAndResolveDirectoryKit("/mock/project", "my-kit")).to.be.rejectedWith(
        FirebaseError,
        "Directory 'my-kit' must contain a package.json file to be installed as a function kit.",
      );
    });

    it("should throw if package.json cannot be parsed", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-kit").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves(true);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .rejects(new Error("Unexpected token"));

      await expect(validateAndResolveDirectoryKit("/mock/project", "my-kit")).to.be.rejectedWith(
        FirebaseError,
        /Failed to parse package\.json in 'my-kit': Unexpected token/,
      );
    });

    it("should return ValidatedDirectoryKit with hasBuildScript: true when build script exists", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-kit").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves(true);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves({
          scripts: {
            build: "tsc",
          },
        });

      const res = await validateAndResolveDirectoryKit("/mock/project", "my-kit");
      expect(res).to.deep.equal({
        absDirectoryPath: "/mock/project/my-kit",
        relSourcePath: "my-kit",
        hasBuildScript: true,
      });
    });

    it("should return ValidatedDirectoryKit with hasBuildScript: false when build script is absent", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-kit").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves(true);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves({
          scripts: {
            start: "node index.js",
          },
        });

      const res = await validateAndResolveDirectoryKit("/mock/project", "my-kit");
      expect(res).to.deep.equal({
        absDirectoryPath: "/mock/project/my-kit",
        relSourcePath: "my-kit",
        hasBuildScript: false,
      });
    });

    it("should handle current directory relative path", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project", "package.json"))
        .resolves(true);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project", "package.json"))
        .resolves({});

      const res = await validateAndResolveDirectoryKit("/mock/project", ".");
      expect(res).to.deep.equal({
        absDirectoryPath: "/mock/project",
        relSourcePath: ".",
        hasBuildScript: false,
      });
    });

    it("should handle package.json containing null", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-kit").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves(true);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves(null);

      const res = await validateAndResolveDirectoryKit("/mock/project", "my-kit");
      expect(res).to.deep.equal({
        absDirectoryPath: "/mock/project/my-kit",
        relSourcePath: "my-kit",
        hasBuildScript: false,
      });
    });
  });

  describe("buildAndInstallDirectoryKit", () => {
    it("should run npm install and npm run build when hasBuildScript is true", async () => {
      await buildAndInstallDirectoryKit("/mock/project/my-kit", true);

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install"],
        "/mock/project/my-kit",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["run", "build"],
        "/mock/project/my-kit",
      );
    });

    it("should run only npm install when hasBuildScript is false", async () => {
      await buildAndInstallDirectoryKit("/mock/project/my-kit", false);

      expect(wrapSpawnStub).to.have.been.calledOnce;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install"],
        "/mock/project/my-kit",
      );
    });

    it("should throw FirebaseError if npm install fails", async () => {
      wrapSpawnStub.withArgs("npm", ["install"]).rejects(new Error("npm install error"));

      await expect(buildAndInstallDirectoryKit("/mock/project/my-kit", true)).to.be.rejectedWith(
        FirebaseError,
        /NPM install failed: npm install error/,
      );
    });

    it("should throw FirebaseError if typescript build fails", async () => {
      wrapSpawnStub.withArgs("npm", ["run", "build"]).rejects(new Error("tsc error"));

      await expect(buildAndInstallDirectoryKit("/mock/project/my-kit", true)).to.be.rejectedWith(
        FirebaseError,
        /TypeScript build failed: tsc error/,
      );
    });
  });

  describe("createDirectoryAdapter", () => {
    it("should find existing kit by local directory path", () => {
      const existingKits: ValidatedKitSingle[] = [
        {
          kit: "dir-kit",
          source: "my-local-kit",
          instances: { inst1: "function-kits/dir-kit/config-inst1" },
        },
      ];
      const adapter = createDirectoryAdapter({
        config: { projectDir: "/mock/project" } as Config,
        directory: "my-local-kit",
      });

      expect(adapter.defaultKitId).to.equal("my-local-kit");
      expect(adapter.findExistingKit(existingKits)).to.equal(existingKits[0]);
    });

    it("should prepare directory source and return predeploy when build script exists", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-kit").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves(true);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves({ scripts: { build: "tsc" } });

      const adapter = createDirectoryAdapter({
        config: { projectDir: "/mock/project" } as Config,
        directory: "my-kit",
      });

      await adapter.validateAndConfirm();
      const prepared = await adapter.prepareSource("my-kit", []);

      expect(prepared).to.deep.equal({
        sourcePath: "my-kit",
        predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
      });
    });
  });
});
