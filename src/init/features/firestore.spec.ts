import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../error";
import * as firestore from "./firestore";
import * as indexes from "./firestore/indexes";
import * as rules from "./firestore/rules";
import * as requirePermissions from "../../requirePermissions";
import * as apiEnabled from "../../ensureApiEnabled";
import * as checkDatabaseType from "../../firestore/checkDatabaseType";
import { Config } from "../../config";

describe("firestore", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let checkApiStub: sinon.SinonStub;
  let checkDbTypeStub: sinon.SinonStub;

  const setup = {
    config: {},
    rcfile: { projects: {}, targets: {}, etags: {} },
    projectId: "my-project-123",
    projectLocation: "us-central1",
  };
  const config = new Config({}, {});

  beforeEach(() => {
    checkApiStub = sandbox.stub(apiEnabled, "check");
    checkDbTypeStub = sandbox.stub(checkDatabaseType, "checkDatabaseType");

    // By default, mock Firestore enabled in Native mode
    checkApiStub.returns(true);
    checkDbTypeStub.returns("FIRESTORE_NATIVE");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("doSetup", () => {
    it("should require access, set up rules and indices, ensure cloud resource location set", async () => {
      const requirePermissionsStub = sandbox
        .stub(requirePermissions, "requirePermissions")
        .resolves();
      const initIndexesStub = sandbox.stub(indexes, "initIndexes").resolves();
      const initRulesStub = sandbox.stub(rules, "initRules").resolves();

      await firestore.askQuestions(setup, config, {});

      expect(requirePermissionsStub).to.have.been.calledOnce;
      expect(initRulesStub).to.have.been.calledOnce;
      expect(initIndexesStub).to.have.been.calledOnce;
    });

    it("should error when the firestore API is not enabled", async () => {
      checkApiStub.returns(false);

      await expect(firestore.askQuestions(setup, config, {})).to.eventually.be.rejectedWith(
        FirebaseError,
        "It looks like you haven't used Cloud Firestore",
      );
    });

    it("should error when firestore is in the wrong mode", async () => {
      checkApiStub.returns(true);
      checkDbTypeStub.returns("CLOUD_DATASTORE_COMPATIBILITY");

      await expect(firestore.askQuestions(setup, config, {})).to.eventually.be.rejectedWith(
        FirebaseError,
        "It looks like this project is using Cloud Datastore or Cloud Firestore in Datastore mode.",
      );
    });
  });
});
