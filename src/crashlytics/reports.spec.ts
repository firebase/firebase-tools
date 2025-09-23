import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { CrashlyticsReport, getReport } from "./reports";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("getReport", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectNumber = "1234567890";

  afterEach(() => {
    nock.cleanAll();
  });

  it("should resolve with the response body on success", async () => {
    const issueType = "FATAL";
    const pageSize = 5;
    const mockResponse = { issues: [{ id: "1" }] };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/topIssues`)
      .query({
        page_size: `${pageSize}`,
        "filter.issue.error_types": issueType,
      })
      .reply(200, mockResponse);

    const result = await getReport(
      CrashlyticsReport.TopIssues,
      appId,
      { issueErrorTypes: [issueType] },
      pageSize,
    );

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";

    await expect(getReport(CrashlyticsReport.TopIssues, invalidAppId, {})).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });
});
