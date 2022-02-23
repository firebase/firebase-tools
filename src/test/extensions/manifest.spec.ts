import { expect } from "chai";
import * as sinon from "sinon";

import * as manifest from "../../extensions/manifest";
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
});
