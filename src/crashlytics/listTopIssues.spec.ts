import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { listTopIssues } from "./listTopIssues";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("listTopIssues", () => {
  const projectId = "my-project";
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectId = "1234567890";

  afterEach(() => {
    nock.cleanAll();
  });

  it("should resolve with the response body on success", async () => {
    const issueType = "FATAL";
    const issueCount = 10;
    const mockResponse = { issues: [{ id: "1" }] };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectId}/apps/${appId}/reports/topIssues`)
      .query({
        page_size: `${issueCount}`,
        "filter.issue.error_types": issueType,
      })
      .reply(200, mockResponse);

    const result = await listTopIssues(projectId, appId, issueType, issueCount);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the API call fails", async () => {
    const issueType = "FATAL";
    const issueCount = 10;

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectId}/apps/${appId}/reports/topIssues`)
      .reply(500, { error: "Internal Server Error" });

    await expect(listTopIssues(projectId, appId, issueType, issueCount)).to.be.rejectedWith(
      FirebaseError,
      /Failed to fetch the top issues/,
    );
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";
    const issueType = "FATAL";
    const issueCount = 10;

    await expect(listTopIssues(projectId, invalidAppId, issueType, issueCount)).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });
});
