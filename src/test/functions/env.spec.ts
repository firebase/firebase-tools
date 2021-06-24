import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../error";
import * as fenv from "../../functions/env";
import * as envstore from "../../functions/envstore";

describe("function env", () => {
  describe("parseKvArgs", () => {
    it("should successfully parse kv args", () => {
      const args = ["FOO=bar", "BAR=foo=bar"];
      expect(fenv.parseKvArgs(args)).to.deep.equal({ FOO: "bar", BAR: "foo=bar" });
    });

    it("should throw error given invalid keys", () => {
      const args = ["FOO=bar", "X_GOOGLE_BAR=foo=bar"];
      expect(() => {
        fenv.parseKvArgs(args);
      }).to.throw(FirebaseError);
    });
  });

  describe("validateKey", () => {
    it("should accept valid keys", () => {
      const keys = ["FOO", "ABC_EFG", "A1_B2"];
      keys.forEach((key) => {
        expect(() => {
          fenv.validateKey(key);
        }).not.to.throw();
      });
    });

    it("should throw error given invalid keys", () => {
      const keys = ["", "A", "1F", "B=C"];
      keys.forEach((key) => {
        expect(() => {
          fenv.validateKey(key);
        }).to.throw(FirebaseError);
      });
    });

    it("should throw error given reserved keys", () => {
      const keys = [
        "FIREBASE_CONFIG",
        "FUNCTION_TARGET",
        "FUNCTION_SIGNATURE_TYPE",
        "K_SERVICE",
        "K_REVISION",
        "PORT",
        "K_CONFIGURATION",
      ];
      keys.forEach((key) => {
        expect(() => {
          fenv.validateKey(key);
        }).to.throw(FirebaseError);
      });
    });

    it("should throw error given keys with reserved prefix", () => {
      expect(() => {
        fenv.validateKey("X_GOOGLE_");
      }).to.throw(FirebaseError);

      expect(() => {
        fenv.validateKey("X_GOOGLE_FOOBAR");
      }).to.throw(FirebaseError);
    });
  });

  describe("formatEnv", () => {
    it("should format env object in a console-friendly way", () => {
      expect(fenv.formatEnv({ FOO: "bar", AB1: "EFG" })).to.equal("FOO=bar\nAB1=EFG");
    });
  });

  describe.only("cloneEnvs", () => {
    let deleteStore: sinon.SinonStub;
    let createStore: sinon.SinonStub;
    let getStore: sinon.SinonStub;

    beforeEach(() => {
      deleteStore = sinon.stub(envstore, "deleteStore").rejects("Unexpected call");
      createStore = sinon.stub(envstore, "createStore").rejects("Unexpected call");
      getStore = sinon.stub(envstore, "getStore").rejects("Unexpected call");
    });

    afterEach(() => {
      deleteStore.restore();
      createStore.restore();
      getStore.restore();
    });

    it("should clone all environment variables from the source project", async () => {
      const envs = {
        FOO: "bar",
        AB1: "ab1",
      };
      const fromP = "project-1";
      const toP = "project-2";

      deleteStore.withArgs(toP, fenv.ENVSTORE_ID).resolves({});
      createStore
        .withArgs(toP, fenv.ENVSTORE_ID, {
          FOO: "bar",
          AB1: "ab1",
        })
        .resolves({ vars: envs });
      getStore.withArgs(fromP, fenv.ENVSTORE_ID).resolves({ vars: envs });

      await fenv.clone({ fromProjectId: fromP, toProjectId: toP, only: [], except: [] });

      expect(deleteStore.calledBefore(createStore));
      expect(deleteStore).to.have.been.calledOnce;
      expect(createStore).to.have.been.calledOnce;
      expect(getStore).to.have.been.calledOnce;
    });

    it("should filter the environment variables using the only option", async () => {
      const envs = {
        A1: "aa",
        A2: "bb",
        A3: "cc",
      };
      const fromP = "project-1";
      const toP = "project-2";

      deleteStore.withArgs(toP, fenv.ENVSTORE_ID).resolves({});
      createStore
        .withArgs(toP, fenv.ENVSTORE_ID, {
          A1: "aa",
          A3: "cc",
        })
        .resolves({ vars: envs });
      getStore.withArgs(fromP, fenv.ENVSTORE_ID).resolves({ vars: envs });

      await fenv.clone({ fromProjectId: fromP, toProjectId: toP, only: ["A1", "A3"], except: [] });

      expect(deleteStore.calledBefore(createStore));
      expect(deleteStore).to.have.been.calledOnce;
      expect(createStore).to.have.been.calledOnce;
      expect(getStore).to.have.been.calledOnce;
    });

    it("should filter the environment variables using the except option", async () => {
      const envs = {
        A1: "aa",
        A2: "bb",
        A3: "cc",
      };
      const fromP = "project-1";
      const toP = "project-2";

      deleteStore.withArgs(toP, fenv.ENVSTORE_ID).resolves({});
      createStore
        .withArgs(toP, fenv.ENVSTORE_ID, {
          A1: "aa",
          A3: "cc",
        })
        .resolves({ vars: envs });
      getStore.withArgs(fromP, fenv.ENVSTORE_ID).resolves({ vars: envs });

      await fenv.clone({ fromProjectId: fromP, toProjectId: toP, only: [], except: ["A2"] });

      expect(deleteStore.calledBefore(createStore));
      expect(deleteStore).to.have.been.calledOnce;
      expect(createStore).to.have.been.calledOnce;
      expect(getStore).to.have.been.calledOnce;
    });

    it("should throw error if both only and except options are given", async () => {
      await expect(
        fenv.clone({ fromProjectId: "", toProjectId: "", only: ["A1"], except: ["A2"] })
      ).to.be.rejectedWith(FirebaseError);
    });
  });
});
