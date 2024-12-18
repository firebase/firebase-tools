import { expect } from "chai";
import _ from "lodash";
import sinon from "sinon";

import { FirebaseError } from "../../error.js";
import * as firestore from "./firestore/index.js";
import * as indexes from "./firestore/indexes.js";
import * as rules from "./firestore/rules.js";
import * as requirePermissions from "../../requirePermissions.js";
import * as apiEnabled from "../../ensureApiEnabled.js";
import * as checkDatabaseType from "../../firestore/checkDatabaseType.js";

describe("firestore", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let checkApiStub: sinon.SinonStub;
  let checkDbTypeStub: sinon.SinonStub;

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

      const setup = { config: {}, projectId: "my-project-123", projectLocation: "us-central1" };

      await firestore.doSetup(setup, {}, {});

      expect(requirePermissionsStub).to.have.been.calledOnce;
      expect(initRulesStub).to.have.been.calledOnce;
      expect(initIndexesStub).to.have.been.calledOnce;
      expect(_.get(setup, "config.firestore")).to.deep.equal({});
    });

    it("should error when the firestore API is not enabled", async () => {
      checkApiStub.returns(false);

      const setup = { config: {}, projectId: "my-project-123" };

      await expect(firestore.doSetup(setup, {}, {})).to.eventually.be.rejectedWith(
        FirebaseError,
        "It looks like you haven't used Cloud Firestore",
      );
    });

    it("should error when firestore is in the wrong mode", async () => {
      checkApiStub.returns(true);
      checkDbTypeStub.returns("CLOUD_DATASTORE_COMPATIBILITY");

      const setup = { config: {}, projectId: "my-project-123" };

      await expect(firestore.doSetup(setup, {}, {})).to.eventually.be.rejectedWith(
        FirebaseError,
        "It looks like this project is using Cloud Datastore or Cloud Firestore in Datastore mode.",
      );
    });
  });
});
