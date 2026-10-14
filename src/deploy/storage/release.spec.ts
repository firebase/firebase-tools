import { expect } from "chai";
import * as sinon from "sinon";

import { RulesDeploy } from "../../rulesDeploy";

import { default as release } from "./release";
import { RC } from "../../rc";

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

  it("should release rules based on targets", async () => {
    const project = "my-project";
    const rulesDeploy = sinon.createStubInstance(RulesDeploy);
    rulesDeploy.release.resolves();
    const rc = sinon.createStubInstance(RC);
    rc.target.withArgs(project, "storage", "my-target").returns(["bar"]);
    const context = {
      storage: {
        rulesDeploy,
        rulesConfigsToDeploy: [{ target: "my-target", rules: "true" }],
      },
    };

    await expect(release(context, { project, rc })).to.eventually.deep.equal(["bar"]);
    expect(rulesDeploy.release).to.be.calledOnce;
  });
});
