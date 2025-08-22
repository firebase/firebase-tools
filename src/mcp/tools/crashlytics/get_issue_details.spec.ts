import { expect } from "chai";
import * as sinon from "sinon";
import { get_issue_details } from "./get_issue_details";
import * as getIssueDetails from "../../../crashlytics/getIssueDetails";
import * as util from "../../util";

describe("get_issue_details tool", () => {
  const appId = "test-app-id";
  const issueId = "test-issue-id";
  const issueDetails = { id: issueId, title: "Crash" };

  let getIssueDetailsStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    getIssueDetailsStub = sinon.stub(getIssueDetails, "getIssueDetails");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should get issue details successfully", async () => {
    getIssueDetailsStub.resolves(issueDetails);

    const result = await (get_issue_details as any)._fn({ app_id: appId, issue_id: issueId });

    expect(getIssueDetailsStub).to.be.calledWith(appId, issueId);
    expect(result).to.deep.equal(util.toContent(issueDetails));
  });

  it("should return an error if app_id is not provided", async () => {
    await (get_issue_details as any)._fn({ issue_id: issueId });
    expect(mcpErrorStub).to.be.calledWith("Must specify 'app_id' parameter.");
  });

  it("should return an error if issue_id is not provided", async () => {
    await (get_issue_details as any)._fn({ app_id: appId });
    expect(mcpErrorStub).to.be.calledWith("Must specify 'issue_id' parameter.");
  });
});
