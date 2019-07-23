import { expect } from "chai";
import * as _ from "lodash";
import * as sinon from "sinon";

import { FirebaseError } from "../../../error";
import * as firestore from "../../../init/features/firestore";
import * as indexes from "../../../init/features/firestore/indexes";
import * as rules from "../../../init/features/firestore/rules";
import * as requireAccess from "../../../requireAccess";

describe("firestore", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  describe("doSetup", () => {
    it("should require access, set up rules and indices, ensure cloud resource location set", async () => {
      const requireAccessStub = sandbox.stub(requireAccess, "requireAccess").resolves();
      const initIndexesStub = sandbox.stub(indexes, "initIndexes").resolves();
      const initRulesStub = sandbox.stub(rules, "initRules").resolves();
      const setup = { config: {}, projectId: "my-project-123", projectLocation: "us-central1" };

      await firestore.doSetup(setup, {});

      expect(requireAccessStub).to.have.been.calledOnce;
      expect(initRulesStub).to.have.been.calledOnce;
      expect(initIndexesStub).to.have.been.calledOnce;
      expect(_.get(setup, "config.firestore")).to.deep.equal({});
    });

    it("should error when cloud resource location is not set", async () => {
      const setup = { config: {}, projectId: "my-project-123" };

      expect(firestore.doSetup(setup, {})).to.eventually.be.rejectedWith(
        FirebaseError,
        "Cloud resource location is not set"
      );
    });
  });
});
