import { expect } from "chai";
import * as sinon from "sinon";

import * as manifest from "../../extensions/manifest";
import * as paramHelper from "../../extensions/paramHelper";

import { Config } from "../../config";
import * as prompt from "../../prompt";

const BASE_CONFIG = new Config(
  {
    extensions: {
      "delete-user-data": "firebase/delete-user-data@0.1.12",
      "delete-user-data-gm2h": "firebase/delete-user-data@0.1.12",
    },
  },
  {}
);

describe("manifest", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  describe(`${manifest.instanceExists}`, () => {
    it("should return true for an existing instance", () => {
      const result = manifest.instanceExists("delete-user-data", BASE_CONFIG);

      expect(result).to.be.true;
    });

    it("should return false for a non-existing instance", () => {
      const result = manifest.instanceExists("does-not-exist", BASE_CONFIG);

      expect(result).to.be.false;
    });
  });

  describe(`${manifest.removeFromManifest.name}`, () => {
    let deleteProjectFileStub: sinon.SinonStub;
    let writeProjectFileStub: sinon.SinonStub;
    beforeEach(() => {
      deleteProjectFileStub = sandbox.stub(Config.prototype, "deleteProjectFile");
      writeProjectFileStub = sandbox.stub(Config.prototype, "writeProjectFile");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should remove form firebase.json and remove .env file", () => {
      const result = manifest.removeFromManifest("delete-user-data", BASE_CONFIG);

      expect(writeProjectFileStub).calledWithExactly("firebase.json", {
        extensions: {
          "delete-user-data": undefined,
          "delete-user-data-gm2h": "firebase/delete-user-data@0.1.12",
        },
      });

      expect(deleteProjectFileStub).calledWithExactly("extensions/delete-user-data.env");
    });
  });

  describe(`${manifest.writeToManifest}`, () => {
    let askWriteProjectFileStub: sinon.SinonStub;
    let writeProjectFileStub: sinon.SinonStub;
    beforeEach(() => {
      askWriteProjectFileStub = sandbox.stub(Config.prototype, "askWriteProjectFile");
      writeProjectFileStub = sandbox.stub(Config.prototype, "writeProjectFile");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should write to both firebase.json and env files", async () => {
      await manifest.writeToManifest(
        [
          {
            instanceId: "instance-1",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "1.0.0",
            },
            params: { a: "pikachu", b: "bulbasaur" },
          },
          {
            instanceId: "instance-2",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "2.0.0",
            },
            params: { a: "eevee", b: "squirtle" },
          },
        ],
        BASE_CONFIG,
        { nonInteractive: false, force: false }
      );
      expect(writeProjectFileStub).calledWithExactly("firebase.json", {
        extensions: {
          "delete-user-data": "firebase/delete-user-data@0.1.12",
          "delete-user-data-gm2h": "firebase/delete-user-data@0.1.12",
          "instance-1": "firebase/bigquery-export@1.0.0",
          "instance-2": "firebase/bigquery-export@2.0.0",
        },
      });

      expect(askWriteProjectFileStub).to.have.been.calledTwice;
      expect(askWriteProjectFileStub).calledWithExactly(
        "extensions/instance-1.env",
        `a=pikachu\nb=bulbasaur`,
        false
      );
      expect(askWriteProjectFileStub).calledWithExactly(
        "extensions/instance-2.env",
        `a=eevee\nb=squirtle`,
        false
      );
    });

    it("should overwrite when user chooses to", async () => {
      // Chooses to overwrite instead of merge.
      sandbox.stub(prompt, "promptOnce").resolves(true);

      await manifest.writeToManifest(
        [
          {
            instanceId: "instance-1",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "1.0.0",
            },
            params: { a: "pikachu", b: "bulbasaur" },
          },
          {
            instanceId: "instance-2",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "2.0.0",
            },
            params: { a: "eevee", b: "squirtle" },
          },
        ],
        BASE_CONFIG,
        { nonInteractive: false, force: false },
        true /** allowOverwrite */
      );
      expect(writeProjectFileStub).calledWithExactly("firebase.json", {
        extensions: {
          // Original list deleted here.
          "instance-1": "firebase/bigquery-export@1.0.0",
          "instance-2": "firebase/bigquery-export@2.0.0",
        },
      });

      expect(askWriteProjectFileStub).to.have.been.calledTwice;
      expect(askWriteProjectFileStub).calledWithExactly(
        "extensions/instance-1.env",
        `a=pikachu\nb=bulbasaur`,
        false
      );
      expect(askWriteProjectFileStub).calledWithExactly(
        "extensions/instance-2.env",
        `a=eevee\nb=squirtle`,
        false
      );
    });
  });

  describe("readParams", () => {
    let readEnvFileStub: sinon.SinonStub;
    const testProjectDir = "test";
    const testProjectId = "my-project";
    const testProjectNumber = "123456";
    const testInstanceId = "extensionId";

    beforeEach(() => {
      readEnvFileStub = sinon.stub(paramHelper, "readEnvFile").returns({});
    });

    afterEach(() => {
      readEnvFileStub.restore();
    });

    it("should read from generic .env file", () => {
      readEnvFileStub
        .withArgs("test/extensions/extensionId.env")
        .returns({ param: "otherValue", param2: "value2" });

      expect(
        manifest.readInstanceParam({
          projectDir: testProjectDir,
          instanceId: testInstanceId,
          projectId: testProjectId,
          projectNumber: testProjectNumber,
          aliases: [],
        })
      ).to.deep.equal({ param: "otherValue", param2: "value2" });
    });

    it("should read from project id .env file", () => {
      readEnvFileStub
        .withArgs("test/extensions/extensionId.env.my-project")
        .returns({ param: "otherValue", param2: "value2" });

      expect(
        manifest.readInstanceParam({
          projectDir: testProjectDir,
          instanceId: testInstanceId,
          projectId: testProjectId,
          projectNumber: testProjectNumber,
          aliases: [],
        })
      ).to.deep.equal({ param: "otherValue", param2: "value2" });
    });

    it("should read from project number .env file", () => {
      readEnvFileStub
        .withArgs("test/extensions/extensionId.env.123456")
        .returns({ param: "otherValue", param2: "value2" });

      expect(
        manifest.readInstanceParam({
          projectDir: testProjectDir,
          instanceId: testInstanceId,
          projectId: testProjectId,
          projectNumber: testProjectNumber,
          aliases: [],
        })
      ).to.deep.equal({ param: "otherValue", param2: "value2" });
    });

    it("should read from an alias .env file", () => {
      readEnvFileStub
        .withArgs("test/extensions/extensionId.env.prod")
        .returns({ param: "otherValue", param2: "value2" });

      expect(
        manifest.readInstanceParam({
          projectDir: testProjectDir,
          instanceId: testInstanceId,
          projectId: testProjectId,
          projectNumber: testProjectNumber,
          aliases: ["prod"],
        })
      ).to.deep.equal({ param: "otherValue", param2: "value2" });
    });

    it("should prefer values from project specific env files", () => {
      readEnvFileStub
        .withArgs("test/extensions/extensionId.env.my-project")
        .returns({ param: "value" });
      readEnvFileStub
        .withArgs("test/extensions/extensionId.env")
        .returns({ param: "otherValue", param2: "value2" });

      expect(
        manifest.readInstanceParam({
          projectDir: testProjectDir,
          instanceId: testInstanceId,
          projectId: testProjectId,
          projectNumber: testProjectNumber,
          aliases: [],
        })
      ).to.deep.equal({ param: "value", param2: "value2" });
    });
  });
});
