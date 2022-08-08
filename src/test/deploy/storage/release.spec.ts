import { expect } from "chai";
import * as sinon from "sinon";

import { RulesDeploy } from "../../../rulesDeploy";

import { default as release } from "../../../deploy/storage/release";

describe("storage.release", () => {
  it("should not release anything if there are no deployable configs", async () => {
    const rulesDeploy = sinon.createStubInstance(RulesDeploy);
    rulesDeploy.release.resolves();
    await expect(release({ storage: { rulesDeploy } }, {})).to.eventually.deep.equal([]);
    expect(rulesDeploy.release).to.not.be.called;
  });

  it("should release rules for a single deploy config", async () => {
    const rulesDeploy = sinon.createStubInstance(RulesDeploy);
    rulesDeploy.release.resolves();
    const context = {
      storage: {
        rulesDeploy,
        rulesConfigsToDeploy: [{ bucket: "foo", rules: "true" }],
      },
    };

    await expect(release(context, {})).to.eventually.deep.equal(["foo"]);
    expect(rulesDeploy.release).to.be.calledOnce;
  });
});
