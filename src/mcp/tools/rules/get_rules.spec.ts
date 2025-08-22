import { expect } from "chai";
import * as sinon from "sinon";
import { getRulesTool } from "./get_rules";
import * as rules from "../../../gcp/rules";
import * as util from "../../util";

describe("getRulesTool factory", () => {
  const projectId = "test-project";
  const productName = "TestProduct";
  const releaseName = "test.release";
  const rulesetName = "ruleset-123";
  const rulesContent = "rules content";

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

  it("should create a tool with the correct definition", () => {
    const tool = getRulesTool(productName, releaseName);
    expect(tool.mcp.name).to.equal("get_rules");
    expect(tool.mcp.description).to.include(productName);
    expect(tool.mcp.annotations.title).to.include(productName);
  });

  it("should execute the created tool successfully", async () => {
    getLatestRulesetNameStub.resolves(rulesetName);
    getRulesetContentStub.resolves([{ content: rulesContent }]);
    const tool = getRulesTool(productName, releaseName);

    const result = await (tool as any)._fn({}, { projectId });

    expect(getLatestRulesetNameStub).to.be.calledWith(projectId, releaseName);
    expect(getRulesetContentStub).to.be.calledWith(rulesetName);
    expect(result).to.deep.equal(util.toContent(rulesContent));
  });

  it("should return an error if no ruleset is found", async () => {
    getLatestRulesetNameStub.resolves(undefined);
    const tool = getRulesTool(productName, releaseName);

    await (tool as any)._fn({}, { projectId });

    expect(mcpErrorStub).to.be.calledWith(
      `No active ${productName} rules were found in project '${projectId}'`,
    );
  });
});
