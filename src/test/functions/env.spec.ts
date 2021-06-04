import { expect } from "chai";
import * as sinon from "sinon";

import * as fenv from "../../functions/env";
import * as envstore from "../../functions/envstore";

describe("function env", () => {
  describe("parseKvArgs", () => {
    it("should successfully parse kv args", () => {
      const args = ["FOO=bar", "BAR=foo=bar"];
      expect(fenv.parseKvArgs(args)).to.deep.equal({ FOO: "bar", BAR: "foo=bar" });
    });

    it("should throw error given invalid keys", () => {
      const args = ["FOO=bar", "BAAR=X_GOOGLE_FOOBAR"];
      expect(() => {
        fenv.parseKvArgs(args);
      }).to.throw;
    });
  });

  describe("validateKey", () => {
    it("should accept valid keys", () => {
      const keys = ["FOO", "ABC_EFG", "A1_B2"];
      keys.forEach((key) => {
        expect(() => {
          fenv.validateKey(key);
        }).to.not.throw;
      });
    });

    it("should throw error given invalid keys", () => {
      const keys = ["", "A", "1F", "B=C"];
      keys.forEach((key) => {
        expect(() => {
          fenv.validateKey(key);
        }).to.not.throw;
      });
    });

    it("should throw error given reserved keys", () => {
      const keys = [
        "FIREBASE_CONFIG",
        "FUNCTION_TARGET",
        "FUNCTION_SIGNATURRE_TYPE",
        "K_SERVICE",
        "K_REVISION",
        "PORT",
        "K_CONFIGURATION",
      ];
      keys.forEach((key) => {
        expect(() => {
          fenv.validateKey(key);
        }).to.throw;
      });
    });

    it("should throw error given keys with reserved prefix", () => {
      expect(() => {
        fenv.validateKey("X_GOOGLE_");
      }).to.throw;

      expect(() => {
        fenv.validateKey("X_GOOGLE_FOOBAR");
      }).to.throw;
    });
  });

  describe("formatEnv", () => {
    it("should format env object in a console-friendly way", () => {
      expect(fenv.formatEnv({ FOO: "bar", AB1: "EFG" })).to.equal("FOO=bar\nAB1=EFG");
    });
  });

  describe("cloneEnvs", () => {
    let createStore: sinon.SinonStub;
    let deleteStore: sinon.SinonStub;
    let getStore: sinon.SinonStub;

    beforeEach(() => {
      createStore = sinon.stub(envstore, "createStore").rejects("Unexpected call");
      deleteStore = sinon.stub(envstore, "deleteStore").rejects("Unexpected call");
      getStore = sinon.stub(envstore, "getStore").rejects("Unexpected call");
    });

    afterEach(() => {
      createStore.restore();
      deleteStore.restore();
      getStore.restore();
    });

    it("should clone all environment variables from the source project", async () => {
      const envs = {
        FOO: "bar",
        AB1: "ab1",
      };
      const fromP = "project-1";
      const toP = "project-2";

      createStore.onFirstCall().resolves({ vars: envs });
      deleteStore.onFirstCall().resolves({});
      getStore.onFirstCall().resolves({ vars: envs });

      await fenv.clone(fromP, toP, [], []);

      expect(createStore).to.have.been.calledOnceWithExactly(toP, fenv.ENVSTORE_ID, envs);
      expect(deleteStore).to.have.been.calledOnceWithExactly(toP, fenv.ENVSTORE_ID);
      expect(getStore).to.have.been.calledOnceWithExactly(fromP, fenv.ENVSTORE_ID);
    });

    it("should filter the environment variables using the --only option", async () => {
      const envs = {
        A1: "aa",
        A2: "bb",
        A3: "cc",
      };
      const fromP = "project-1";
      const toP = "project-2";

      createStore.onFirstCall().resolves({ vars: envs });
      deleteStore.onFirstCall().resolves({});
      getStore.onFirstCall().resolves({ vars: envs });

      await fenv.clone(fromP, toP, ["A1", "A3"], []);

      expect(createStore).to.have.been.calledOnceWithExactly(toP, fenv.ENVSTORE_ID, {
        A1: "aa",
        A3: "cc",
      });
      expect(deleteStore).to.have.been.calledOnceWithExactly(toP, fenv.ENVSTORE_ID);
      expect(getStore).to.have.been.calledOnceWithExactly(fromP, fenv.ENVSTORE_ID);
    });

    it("should filter the environment variables using the --except option", async () => {
      const envs = {
        A1: "aa",
        A2: "bb",
        A3: "cc",
      };
      const fromP = "project-1";
      const toP = "project-2";

      createStore.onFirstCall().resolves({ vars: envs });
      deleteStore.onFirstCall().resolves({});
      getStore.onFirstCall().resolves({ vars: envs });

      await fenv.clone(fromP, toP, [], ["A2"]);

      expect(createStore).to.have.been.calledOnceWithExactly(toP, fenv.ENVSTORE_ID, {
        A1: "aa",
        A3: "cc",
      });
      expect(deleteStore).to.have.been.calledOnceWithExactly(toP, fenv.ENVSTORE_ID);
      expect(getStore).to.have.been.calledOnceWithExactly(fromP, fenv.ENVSTORE_ID);
    });
  });
});
