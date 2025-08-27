import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { updateIssue, IssueState } from "./updateIssue";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("updateIssue", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectNumber = "1234567890";
  const issueId = "test-issue-id";

  afterEach(() => {
    nock.cleanAll();
  });

  it("should resolve with the updated issue on success", async () => {
    const state = IssueState.CLOSED;
    const mockResponse = {
      id: issueId,
      state: state,
    };

    nock(crashlyticsApiOrigin())
      .patch(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}`, {
        state,
      })
      .query({ updateMask: "state" })
      .reply(200, mockResponse);

    const result = await updateIssue(appId, issueId, state);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the API call fails", async () => {
    const state = IssueState.OPEN;
    nock(crashlyticsApiOrigin())
      .patch(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}`)
      .query({ updateMask: "state" })
      .reply(500, { error: "Internal Server Error" });

    await expect(updateIssue(appId, issueId, state)).to.be.rejectedWith(
      FirebaseError,
      `Failed to update issue ${issueId} for app ${appId}.`,
    );
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";
    await expect(updateIssue(invalidAppId, issueId, IssueState.CLOSED)).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });
});
