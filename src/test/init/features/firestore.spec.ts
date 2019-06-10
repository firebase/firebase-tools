import { expect } from "chai";
import * as _ from "lodash";
import * as sinon from "sinon";

import * as firestore from "../../../init/features/firestore/firestore";
import * as indexes from "../../../init/features/firestore/indexes";
import * as rules from "../../../init/features/firestore/rules";
import * as requireAccess from "../../../requireAccess";

describe("firestore", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  describe("doSetup", () => {
    // this will be used in the future to test cloud resource location check
    it("should require access and set up rules and indices", async () => {
      const requireAccessStub = sandbox.stub(requireAccess, "requireAccess").resolves();
      const initIndexesStub = sandbox.stub(indexes, "initIndexes").resolves();
      const initRulesStub = sandbox.stub(rules, "initRules").resolves();
      const setup = { config: {}, projectId: "my-project-123" };

      await firestore.doSetup(setup, {});

      expect(requireAccessStub.calledOnce).to.be.true;
      expect(initRulesStub.calledOnce).to.be.true;
      expect(initIndexesStub.calledOnce).to.be.true;
      expect(_.get(setup, "config.firestore")).to.deep.equal({});
    });
  });
});
