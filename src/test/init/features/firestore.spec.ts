import { expect } from "chai";
import * as _ from "lodash";
import * as sinon from "sinon";

import { FirebaseError } from "../../../error";
import * as firestore from "../../../init/features/firestore";
import * as indexes from "../../../init/features/firestore/indexes";
import * as rules from "../../../init/features/firestore/rules";
import * as requirePermissions from "../../../requirePermissions";
import * as apiEnabled from "../../../ensureApiEnabled";

describe("firestore", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let checkApiStub: sinon.SinonStub;

  beforeEach(() => {
    checkApiStub = sandbox.stub(apiEnabled, "check");
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
      checkApiStub.returns(true);

      const setup = { config: {}, projectId: "my-project-123", projectLocation: "us-central1" };

      await firestore.doSetup(setup, {});

      expect(requirePermissionsStub).to.have.been.calledOnce;
      expect(initRulesStub).to.have.been.calledOnce;
      expect(initIndexesStub).to.have.been.calledOnce;
      expect(_.get(setup, "config.firestore")).to.deep.equal({});
    });

    it("should error when cloud resource location is not set", async () => {
      checkApiStub.returns(true);

      const setup = { config: {}, projectId: "my-project-123" };

      expect(firestore.doSetup(setup, {})).to.eventually.be.rejectedWith(
        FirebaseError,
        "Cloud resource location is not set"
      );
    });

    it("should error when the firestore API is not enabled", async () => {
      checkApiStub.returns(false);

      const setup = { config: {}, projectId: "my-project-123" };

      expect(firestore.doSetup(setup, {})).to.eventually.be.rejectedWith(
        FirebaseError,
        "It looks like you haven't used Cloud Firestore"
      );
    });
  });
});
