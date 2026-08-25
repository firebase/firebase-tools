import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./functions-kits-install";
import * as kits from "../functions/kits/install";
import * as experiments from "../experiments";
import { Config } from "../config";
import { FirebaseError } from "../error";
import { RC } from "../rc";

describe("functions:kits:install", () => {
  let assertEnabledStub: sinon.SinonStub;
  let installKitOrInstanceStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = [];
    sinon.stub(command, "prepare").resolves();
    assertEnabledStub = sinon.stub(experiments, "assertEnabled");
    installKitOrInstanceStub = sinon.stub(kits, "installKitOrInstance").resolves({
      action: "installedKit",
      kitId: "firestore-bigquery-export",
      instanceId: "firestore-bigquery-export",
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("command action", () => {
    it("should assert that kits experiment is enabled", async () => {
      assertEnabledStub.throws(new FirebaseError("kits experiment disabled"));

      await expect(
        command.runner()({
          package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, "kits experiment disabled");

      expect(assertEnabledStub).to.have.been.calledWith("kits", "install a function kit");
    });

    it("should throw an error if not in a Firebase project directory", async () => {
      await expect(
        command.runner()({
          package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, /firebase.json not found/);
    });

    it("should throw an error if --package is not provided", async () => {
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
      ).to.be.rejectedWith(
        FirebaseError,
        /Set the --package option to a valid NPM package and try again\./,
      );
    });

    it("should delegate to installKitOrInstance with the provided options", async () => {
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
        package: "@firebase-functions-kits/firestore-bigquery-export@1.0.0",
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
        package: "@firebase-functions-kits/firestore-bigquery-export@1.0.0",
        template: "migration",
        nonInteractive: true,
        project: "my-project",
        projectId: "my-project",
        rc: mockRc,
      });
    });
  });
});
