import { expect } from "chai";
import * as sinon from "sinon";
import { get_rules } from "./get_rules";
import * as rules from "../../../gcp/rules";
import * as util from "../../util";

describe("storage get_rules tool", () => {
  const projectId = "test-project";
  const rulesetName = "ruleset-123";
  const rulesContent = "rules_version = '2';";

  let getLatestRulesetNameStub: sinon.SinonStub;
  let getRulesetContentStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    getLatestRulesetNameStub = sinon.stub(rules, "getLatestRulesetName");
    getRulesetContentStub = sinon.stub(rules, "getRulesetContent");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should get storage rules successfully", async () => {
    getLatestRulesetNameStub.resolves(rulesetName);
    getRulesetContentStub.resolves([{ content: rulesContent }]);

    const result = await (get_rules as any)._fn({}, { projectId });

    expect(getLatestRulesetNameStub).to.be.calledWith(projectId, "firebase.storage");
    expect(getRulesetContentStub).to.be.calledWith(rulesetName);
    expect(result).to.deep.equal(util.toContent(rulesContent));
  });

  it("should return an error if no ruleset is found", async () => {
    getLatestRulesetNameStub.resolves(undefined);

    await (get_rules as any)._fn({}, { projectId });

    expect(mcpErrorStub).to.be.calledWith(
      `No active Firebase Storage rules were found in project '${projectId}'`,
    );
  });
});
