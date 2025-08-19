import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { getIssueDetails } from "./getIssueDetails";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("getIssueDetails", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectNumber = "1234567890";
  const issueId = "test_issue_id";

  afterEach(() => {
    nock.cleanAll();
  });

  it("should resolve with the response body on success", async () => {
    const mockResponse = { id: issueId, title: "Crash" };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}`)
      .reply(200, mockResponse);

    const result = await getIssueDetails(appId, issueId);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the API call fails", async () => {
    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}`)
      .reply(500, { error: "Internal Server Error" });

    await expect(getIssueDetails(appId, issueId)).to.be.rejectedWith(
      FirebaseError,
      /Failed to fetch the issue details/,
    );
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";

    await expect(getIssueDetails(invalidAppId, issueId)).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });
});
