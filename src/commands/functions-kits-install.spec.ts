import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./functions-kits-install";
import * as kits from "../functions/kits/install";
import * as experiments from "../experiments";
import { Config } from "../config";
import { FirebaseError } from "../error";
import { RC } from "../rc";
import { requireAuth } from "../requireAuth";
import { requireConfig } from "../requireConfig";

describe("functions:kits:install", () => {
  const originalBefores = [...(command["befores"] || [])];
  let assertEnabledStub: sinon.SinonStub;
  let installKitOrInstanceStub: sinon.SinonStub;

  beforeEach(() => {
    command["befores"] = [];
    sinon.stub(command, "prepare").resolves();
    assertEnabledStub = sinon.stub(experiments, "assertEnabled");
    installKitOrInstanceStub = sinon.stub(kits, "installKitOrInstance").resolves({
      action: "installedKit",
      kitId: "firestore-bigquery-export",
      instanceId: "firestore-bigquery-export",
    });
  });

  afterEach(() => {
    command["befores"] = [...originalBefores];
    sinon.restore();
  });

  describe("command configuration", () => {
    it("should have requireConfig and requireAuth as before hooks", () => {
      expect(originalBefores).to.deep.equal([
        { fn: requireConfig, args: [] },
        { fn: requireAuth, args: [] },
      ]);
    });
  });

  describe("command action", () => {
    it("should assert that kits experiment is enabled", async () => {
      assertEnabledStub.throws(new FirebaseError("kits experiment disabled"));

      await expect(
        command.runner()({
          package: "@firebase-function-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, "kits experiment disabled");

      expect(assertEnabledStub).to.have.been.calledWith("kits", "install a function kit");
    });

    it("should throw an error if not in a Firebase project directory", async () => {
      await expect(
        command.runner()({
          package: "@firebase-function-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, /firebase.json not found/);
    });

    it("should throw an error if neither --package nor --directory is provided", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => `/mock/project/${p}`,
      } as unknown as Config;

      await expect(
        command.runner()({
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, /Must specify either --package or --directory\./);
    });

    it("should throw an error if both --package and --directory are provided", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => `/mock/project/${p}`,
      } as unknown as Config;

      await expect(
        command.runner()({
          package: "@firebase-function-kits/firestore-bigquery-export",
          directory: "./my-kit",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        /Cannot specify both --package and --directory\. Please choose one\./,
      );
    });

    it("should throw an error if both --directory and --template are provided", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => `/mock/project/${p}`,
      } as unknown as Config;

      await expect(
        command.runner()({
          directory: "./my-kit",
          template: "migration",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, /Cannot specify --template with --directory\./);
    });

    it("should delegate to installKitOrInstance with the provided --package options", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => `/mock/project/${p}`,
      } as unknown as Config;

      const mockRc = {
        hasProjects: true,
      };

      await command.runner()({
        package: "@firebase-function-kits/firestore-bigquery-export@1.0.0",
        template: "migration",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
        project: "my-project",
        projectId: "my-project",
        rc: mockRc as unknown as RC,
      });

      expect(installKitOrInstanceStub).to.have.been.calledOnceWith({
        config: mockConfig,
        package: "@firebase-function-kits/firestore-bigquery-export@1.0.0",
        directory: undefined,
        template: "migration",
        nonInteractive: true,
        force: undefined,
        configure: undefined,
        project: "my-project",
        projectId: "my-project",
        rc: mockRc,
      });
    });

    it("should delegate to installKitOrInstance with the provided --directory options", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => `/mock/project/${p}`,
      } as unknown as Config;

      const mockRc = {
        hasProjects: true,
      };

      await command.runner()({
        directory: "./my-local-kit",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
        force: true,
        project: "my-project",
        projectId: "my-project",
        rc: mockRc as unknown as RC,
      });

      expect(installKitOrInstanceStub).to.have.been.calledOnceWith({
        config: mockConfig,
        package: undefined,
        directory: "./my-local-kit",
        template: undefined,
        nonInteractive: true,
        force: true,
        configure: undefined,
        project: "my-project",
        projectId: "my-project",
        rc: mockRc,
      });
    });

    it("should pass configure: false when --no-configure is provided", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => `/mock/project/${p}`,
      } as unknown as Config;

      const mockRc = {
        hasProjects: true,
      };

      await command.runner()({
        package: "@firebase-function-kits/firestore-bigquery-export",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
        configure: false,
        project: "my-project",
        projectId: "my-project",
        rc: mockRc as unknown as RC,
      });

      expect(installKitOrInstanceStub).to.have.been.calledOnceWith({
        config: mockConfig,
        package: "@firebase-function-kits/firestore-bigquery-export",
        directory: undefined,
        template: undefined,
        nonInteractive: true,
        force: undefined,
        configure: false,
        project: "my-project",
        projectId: "my-project",
        rc: mockRc,
      });
    });
  });
});
