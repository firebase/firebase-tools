import { expect } from "chai";
import * as sinon from "sinon";

import * as manifest from "../../extensions/manifest";
import * as paramHelper from "../../extensions/paramHelper";
import * as refs from "../../extensions/refs";

import { Config } from "../../config";
import * as prompt from "../../prompt";
import { FirebaseError } from "../../error";
import { ParamType } from "../../extensions/types";

/**
 * Returns a base Config with some extensions data.
 *
 * The inner content cannot be a constant because Config edits in-place and mutates
 * the state between tests.
 */
function generateBaseConfig(): Config {
  return new Config(
    {
      extensions: {
        "delete-user-data": "firebase/delete-user-data@0.1.12",
        "delete-user-data-gm2h": "firebase/delete-user-data@0.1.12",
      },
    },
    {},
  );
}
function generateConfigWithLocal(): Config {
  return new Config(
    {
      extensions: {
        "delete-user-data": "firebase/delete-user-data@0.1.12",
        "delete-user-data-gm2h": "firebase/delete-user-data@0.1.12",
        "delete-user-data-local": "./delete-user-data",
      },
    },
    {},
  );
}

describe("manifest", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  describe(`${manifest.instanceExists.name}`, () => {
    it("should return true for an existing instance", () => {
      const result = manifest.instanceExists("delete-user-data", generateBaseConfig());

      expect(result).to.be.true;
    });

    it("should return false for a non-existing instance", () => {
      const result = manifest.instanceExists("does-not-exist", generateBaseConfig());

      expect(result).to.be.false;
    });
  });

  describe(`${manifest.getInstanceTarget.name}`, () => {
    it("should return the correct source for a local instance", () => {
      const result = manifest.getInstanceTarget(
        "delete-user-data-local",
        generateConfigWithLocal(),
      );

      expect(result).to.equal("./delete-user-data");
    });

    it("should return the correct source for an instance with ref", () => {
      const result = manifest.getInstanceTarget("delete-user-data", generateConfigWithLocal());

      expect(result).to.equal("firebase/delete-user-data@0.1.12");
    });

    it("should throw when looking for a non-existing instance", () => {
      expect(() =>
        manifest.getInstanceTarget("does-not-exist", generateConfigWithLocal()),
      ).to.throw(FirebaseError);
    });
  });

  describe(`${manifest.getInstanceRef.name}`, () => {
    it("should return the correct ref for an existing instance", () => {
      const result = manifest.getInstanceRef("delete-user-data", generateConfigWithLocal());

      expect(refs.toExtensionVersionRef(result)).to.equal(
        refs.toExtensionVersionRef({
          publisherId: "firebase",
          extensionId: "delete-user-data",
          version: "0.1.12",
        }),
      );
    });

    it("should throw when looking for a non-existing instance", () => {
      expect(() => manifest.getInstanceRef("does-not-exist", generateConfigWithLocal())).to.throw(
        FirebaseError,
      );
    });

    it("should throw when looking for a instance with local source", () => {
      expect(() =>
        manifest.getInstanceRef("delete-user-data-local", generateConfigWithLocal()),
      ).to.throw(FirebaseError);
    });
  });

  describe(`${manifest.removeFromManifest.name}`, () => {
    let deleteProjectFileStub: sinon.SinonStub;
    let writeProjectFileStub: sinon.SinonStub;
    let projectFileExistsStub: sinon.SinonStub;
    beforeEach(() => {
      deleteProjectFileStub = sandbox.stub(Config.prototype, "deleteProjectFile");
      writeProjectFileStub = sandbox.stub(Config.prototype, "writeProjectFile");
      projectFileExistsStub = sandbox.stub(Config.prototype, "projectFileExists");
      projectFileExistsStub.returns(true);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should remove from firebase.json and remove .env file", () => {
      manifest.removeFromManifest("delete-user-data", generateBaseConfig());

      expect(writeProjectFileStub).calledWithExactly("firebase.json", {
        extensions: {
          "delete-user-data": undefined,
          "delete-user-data-gm2h": "firebase/delete-user-data@0.1.12",
        },
      });

      expect(deleteProjectFileStub).calledWithExactly("extensions/delete-user-data.env");
    });
  });

  describe(`${manifest.writeToManifest.name}`, () => {
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
            params: { a: { baseValue: "pikachu" }, b: { baseValue: "bulbasaur" } },
            extensionSpec: {
              name: "bigquery-export",
              version: "1.0.0",
              resources: [],
              sourceUrl: "",
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.STRING,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.STRING,
                },
              ],
              systemParams: [],
            },
          },
          {
            instanceId: "instance-2",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "2.0.0",
            },
            params: { a: { baseValue: "eevee" }, b: { baseValue: "squirtle" } },
            extensionSpec: {
              name: "bigquery-export",
              version: "1.0.0",
              resources: [],
              sourceUrl: "",
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.SECRET,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.SECRET,
                },
              ],
              systemParams: [],
            },
          },
        ],
        generateBaseConfig(),
        { nonInteractive: false, force: false },
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
        false,
      );
      expect(askWriteProjectFileStub).calledWithExactly(
        "extensions/instance-2.env",
        `a=eevee\nb=squirtle`,
        false,
      );
    });

    it("should write to env files in stable, alphabetical by key order", async () => {
      await manifest.writeToManifest(
        [
          {
            instanceId: "instance-1",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "1.0.0",
            },
            params: { b: { baseValue: "bulbasaur" }, a: { baseValue: "absol" } },
            extensionSpec: {
              name: "bigquery-export",
              version: "1.0.0",
              resources: [],
              sourceUrl: "",
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.STRING,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.STRING,
                },
              ],
              systemParams: [],
            },
          },
          {
            instanceId: "instance-2",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "2.0.0",
            },
            params: { e: { baseValue: "eevee" }, s: { baseValue: "squirtle" } },
            extensionSpec: {
              name: "bigquery-export",
              version: "1.0.0",
              resources: [],
              sourceUrl: "",
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.STRING,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.STRING,
                },
              ],
              systemParams: [],
            },
          },
        ],
        generateBaseConfig(),
        { nonInteractive: false, force: false },
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
        `a=absol\nb=bulbasaur`,
        false,
      );
      expect(askWriteProjectFileStub).calledWithExactly(
        "extensions/instance-2.env",
        `e=eevee\ns=squirtle`,
        false,
      );
    });

    it("should write events-related env vars", async () => {
      await manifest.writeToManifest(
        [
          {
            instanceId: "instance-1",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "1.0.0",
            },
            params: {
              b: { baseValue: "bulbasaur" },
              a: { baseValue: "absol" },
              EVENTARC_CHANNEL: {
                baseValue: "projects/test-project/locations/us-central1/channels/firebase",
              },
              ALLOWED_EVENT_TYPES: { baseValue: "google.firebase.custom-event-occurred" },
            },
            extensionSpec: {
              name: "bigquery-export",
              version: "1.0.0",
              resources: [],
              sourceUrl: "",
              events: [
                {
                  type: "google.firebase.custom-event-occurred",
                  description: "Custom event occurred",
                },
              ],
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.STRING,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.STRING,
                },
              ],
              systemParams: [],
            },
          },
          {
            instanceId: "instance-2",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "2.0.0",
            },
            params: {
              e: { baseValue: "eevee" },
              s: { baseValue: "squirtle" },
              EVENTARC_CHANNEL: {
                baseValue: "projects/test-project/locations/us-central1/channels/firebase",
              },
              ALLOWED_EVENT_TYPES: { baseValue: "google.firebase.custom-event-occurred" },
            },
            extensionSpec: {
              name: "bigquery-export",
              version: "2.0.0",
              resources: [],
              sourceUrl: "",
              events: [
                {
                  type: "google.firebase.custom-event-occurred",
                  description: "Custom event occurred",
                },
              ],
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.STRING,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.STRING,
                },
              ],
              systemParams: [],
            },
          },
        ],
        generateBaseConfig(),
        { nonInteractive: false, force: false },
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
        "a=absol\n" +
          "ALLOWED_EVENT_TYPES=google.firebase.custom-event-occurred\n" +
          "b=bulbasaur\n" +
          "EVENTARC_CHANNEL=projects/test-project/locations/us-central1/channels/firebase",
        false,
      );
      expect(askWriteProjectFileStub).calledWithExactly(
        "extensions/instance-2.env",
        "ALLOWED_EVENT_TYPES=google.firebase.custom-event-occurred\n" +
          "e=eevee\n" +
          "EVENTARC_CHANNEL=projects/test-project/locations/us-central1/channels/firebase\n" +
          "s=squirtle",
        false,
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
            params: { a: { baseValue: "pikachu" }, b: { baseValue: "bulbasaur" } },
            extensionSpec: {
              name: "bigquery-export",
              version: "1.0.0",
              resources: [],
              sourceUrl: "",
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.STRING,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.STRING,
                },
              ],
              systemParams: [],
            },
          },
          {
            instanceId: "instance-2",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "2.0.0",
            },
            params: { a: { baseValue: "eevee" }, b: { baseValue: "squirtle" } },
            extensionSpec: {
              name: "bigquery-export",
              version: "1.0.0",
              resources: [],
              sourceUrl: "",
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.STRING,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.STRING,
                },
              ],
              systemParams: [],
            },
          },
        ],
        generateBaseConfig(),
        { nonInteractive: false, force: false },
        true /** allowOverwrite */,
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
        false,
      );
      expect(askWriteProjectFileStub).calledWithExactly(
        "extensions/instance-2.env",
        `a=eevee\nb=squirtle`,
        false,
      );
    });

    it("should not write empty values", async () => {
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
            params: { a: { baseValue: "pikachu" }, b: { baseValue: "" } },
            extensionSpec: {
              name: "bigquery-export",
              version: "1.0.0",
              resources: [],
              sourceUrl: "",
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.STRING,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.STRING,
                },
              ],
              systemParams: [],
            },
          },
        ],
        generateBaseConfig(),
        { nonInteractive: false, force: false },
        true /** allowOverwrite */,
      );
      expect(writeProjectFileStub).calledWithExactly("firebase.json", {
        extensions: {
          // Original list deleted here.
          "instance-1": "firebase/bigquery-export@1.0.0",
        },
      });

      expect(askWriteProjectFileStub).to.have.been.calledOnce;
      expect(askWriteProjectFileStub).calledWithExactly(
        "extensions/instance-1.env",
        `a=pikachu`,
        false,
      );
    });
  });

  describe(`${manifest.writeLocalSecrets.name}`, () => {
    let askWriteProjectFileStub: sinon.SinonStub;

    beforeEach(() => {
      askWriteProjectFileStub = sandbox.stub(Config.prototype, "askWriteProjectFile");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should write all secret params that have local values", async () => {
      await manifest.writeLocalSecrets(
        [
          {
            instanceId: "instance-1",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "1.0.0",
            },
            params: {
              a: { baseValue: "base", local: "pikachu" },
              b: { baseValue: "base", local: "bulbasaur" },
            },
            extensionSpec: {
              name: "bigquery-export",
              version: "1.0.0",
              resources: [],
              sourceUrl: "",
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.SECRET,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.SECRET,
                },
              ],
              systemParams: [],
            },
          },
          {
            instanceId: "instance-2",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "2.0.0",
            },
            params: {
              a: { baseValue: "base", local: "eevee" },
              b: { baseValue: "base", local: "squirtle" },
            },
            extensionSpec: {
              name: "bigquery-export",
              version: "1.0.0",
              resources: [],
              sourceUrl: "",
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.SECRET,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.SECRET,
                },
              ],
              systemParams: [],
            },
          },
        ],
        generateBaseConfig(),
        true,
      );

      expect(askWriteProjectFileStub).to.have.been.calledTwice;
      expect(askWriteProjectFileStub).calledWithExactly(
        "extensions/instance-1.secret.local",
        `a=pikachu\nb=bulbasaur`,
        true,
      );
      expect(askWriteProjectFileStub).calledWithExactly(
        "extensions/instance-2.secret.local",
        `a=eevee\nb=squirtle`,
        true,
      );
    });

    it("should write only secret with local values", async () => {
      await manifest.writeLocalSecrets(
        [
          {
            instanceId: "instance-1",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "1.0.0",
            },
            params: {
              a: { baseValue: "base", local: "pikachu" },
              b: { baseValue: "base" },
            },
            extensionSpec: {
              name: "bigquery-export",
              version: "1.0.0",
              resources: [],
              sourceUrl: "",
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.SECRET,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.SECRET,
                },
              ],
              systemParams: [],
            },
          },
        ],
        generateBaseConfig(),
        true,
      );

      expect(askWriteProjectFileStub).to.have.been.calledOnce;
      expect(askWriteProjectFileStub).calledWithExactly(
        "extensions/instance-1.secret.local",
        `a=pikachu`,
        true,
      );
    });

    it("should write only local values that are ParamType.SECRET", async () => {
      await manifest.writeLocalSecrets(
        [
          {
            instanceId: "instance-1",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "1.0.0",
            },
            params: {
              a: { baseValue: "base", local: "pikachu" },
              b: { baseValue: "base", local: "bulbasaur" },
            },
            extensionSpec: {
              name: "bigquery-export",
              version: "1.0.0",
              resources: [],
              sourceUrl: "",
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.SECRET,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.STRING,
                },
              ],
              systemParams: [],
            },
          },
        ],
        generateBaseConfig(),
        true,
      );

      expect(askWriteProjectFileStub).to.have.been.calledOnce;
      expect(askWriteProjectFileStub).calledWithExactly(
        "extensions/instance-1.secret.local",
        `a=pikachu`,
        true,
      );
    });

    it("should not write the file if there's no matching params", async () => {
      await manifest.writeLocalSecrets(
        [
          {
            instanceId: "instance-1",
            ref: {
              publisherId: "firebase",
              extensionId: "bigquery-export",
              version: "1.0.0",
            },
            params: {
              // No local values
              a: { baseValue: "base" },
              b: { baseValue: "base" },
            },
            extensionSpec: {
              name: "bigquery-export",
              version: "1.0.0",
              resources: [],
              sourceUrl: "",
              params: [
                {
                  param: "a",
                  label: "",
                  type: ParamType.SECRET,
                },
                {
                  param: "b",
                  label: "",
                  type: ParamType.STRING,
                },
              ],
              systemParams: [],
            },
          },
        ],
        generateBaseConfig(),
        true,
      );

      expect(askWriteProjectFileStub).to.not.have.been.called;
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
        }),
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
        }),
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
        }),
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
        }),
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
        }),
      ).to.deep.equal({ param: "value", param2: "value2" });
    });
  });
});
