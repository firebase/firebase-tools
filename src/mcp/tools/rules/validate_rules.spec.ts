import { expect } from "chai";
import * as sinon from "sinon";
import { validateRulesTool } from "./validate_rules";
import * as rules from "../../../gcp/rules";
import * as util from "../../util";
import * as path from "path";

describe("validateRulesTool factory", () => {
  const projectId = "test-project";
  const productName = "TestProduct";
  const source = "rules_version = '2';";
  const sourceFile = "test.rules";
  const mockConfig: any = {
    readProjectFile: sinon.stub(),
  };
  const mockHost: any = {
    cachedProjectRoot: "/project/root",
  };

  let testRulesetStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    testRulesetStub = sinon.stub(rules, "testRuleset");
    mcpErrorStub = sinon.stub(util, "mcpError");
    sinon.stub(path, "resolve").returns(`/project/root/${sourceFile}`);
    mockConfig.readProjectFile.reset();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should create a tool with the correct definition", () => {
    const tool = validateRulesTool(productName);
    expect(tool.mcp.name).to.equal("validate_rules");
    expect(tool.mcp.description).to.include(productName);
  });

  it("should validate from source string with no issues", async () => {
    testRulesetStub.resolves({ body: { issues: [] } });
    const tool = validateRulesTool(productName);
    const result = await (tool as any)._fn(
      { source },
      { projectId, config: mockConfig, host: mockHost },
    );
    expect(testRulesetStub).to.be.calledWith(projectId, [{ name: "test.rules", content: source }]);
    expect(result).to.deep.equal(util.toContent("OK: No errors detected."));
  });

  it("should validate from source file with issues", async () => {
    const issues = [
      {
        sourcePosition: { line: 1, column: 1, currentOffset: 0, endOffset: 1 },
        description: "Syntax error",
        severity: "ERROR",
      },
    ];
    mockConfig.readProjectFile.withArgs(sourceFile).returns(source);
    testRulesetStub.resolves({ body: { issues } });
    const tool = validateRulesTool(productName);

    const result = await (tool as any)._fn(
      { source_file: sourceFile },
      { projectId, config: mockConfig, host: mockHost },
    );

    expect(mockConfig.readProjectFile).to.be.calledWith(sourceFile);
    expect(result.content).to.include("Found 1 issues");
    expect(result.content).to.include("Syntax error");
  });

  it("should return an error if both source and source_file are provided", async () => {
    const tool = validateRulesTool(productName);
    await (tool as any)._fn(
      { source, source_file: sourceFile },
      { projectId, config: mockConfig, host: mockHost },
    );
    expect(mcpErrorStub).to.be.calledWith("Must supply `source` or `source_file`, not both.");
  });

  it("should return an error if source_file cannot be read", async () => {
    const error = new Error("File not found");
    mockConfig.readProjectFile.withArgs(sourceFile).throws(error);
    const tool = validateRulesTool(productName);
    await (tool as any)._fn(
      { source_file: sourceFile },
      { projectId, config: mockConfig, host: mockHost },
    );
    expect(mcpErrorStub).to.be.calledWith(
      `Failed to read source_file '${sourceFile}': ${error.message}`,
    );
  });
});
