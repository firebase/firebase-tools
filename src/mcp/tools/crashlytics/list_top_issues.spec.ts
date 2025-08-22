import { expect } from "chai";
import * as sinon from "sinon";
import { list_top_issues } from "./list_top_issues";
import * as listTopIssues from "../../../crashlytics/listTopIssues";
import * as util from "../../util";

describe("list_top_issues tool", () => {
  const projectId = "test-project";
  const appId = "test-app-id";
  const issues = [{ id: "issue1" }];

  let listTopIssuesStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    listTopIssuesStub = sinon.stub(listTopIssues, "listTopIssues");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should list issues with default parameters", async () => {
    listTopIssuesStub.resolves(issues);
    const result = await (list_top_issues as any)._fn({ app_id: appId }, { projectId });

    expect(listTopIssuesStub).to.be.calledWith(projectId, appId, "FATAL", 10);
    expect(result).to.deep.equal(util.toContent(issues));
  });

  it("should list issues with specified parameters", async () => {
    listTopIssuesStub.resolves(issues);
    const result = await (list_top_issues as any)._fn(
      { app_id: appId, issue_type: "ANR", issue_count: 5 },
      { projectId },
    );

    expect(listTopIssuesStub).to.be.calledWith(projectId, appId, "ANR", 5);
    expect(result).to.deep.equal(util.toContent(issues));
  });

  it("should return an error if app_id is not provided", async () => {
    await (list_top_issues as any)._fn({}, { projectId });
    expect(mcpErrorStub).to.be.calledWith("Must specify 'app_id' parameter.");
  });
});
