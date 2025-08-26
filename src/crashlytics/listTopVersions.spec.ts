import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { listTopVersions } from "./listTopVersions";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("listTopVersions", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectNumber = "1234567890";

  afterEach(() => {
    nock.cleanAll();
  });

  it("should resolve with the response body on success", async () => {
    const versionCount = 10;
    const mockResponse = {
      groups: [{ metrics: { eventsCount: 1 }, version: { displayName: "1.0.0" } }],
    };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/topVersions`)
      .query({
        page_size: `${versionCount}`,
      })
      .reply(200, mockResponse);

    const result = await listTopVersions(appId, versionCount);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should resolve with the response body on success with issueId", async () => {
    const versionCount = 10;
    const issueId = "test-issue-id";
    const mockResponse = {
      groups: [{ metrics: { eventsCount: 1 }, version: { displayName: "1.0.0" } }],
    };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/topVersions`)
      .query({
        page_size: `${versionCount}`,
        "filter.issue.id": issueId,
      })
      .reply(200, mockResponse);

    const result = await listTopVersions(appId, versionCount, issueId);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the API call fails", async () => {
    const versionCount = 10;

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/topVersions`)
      .reply(500, { error: "Internal Server Error" });

    await expect(listTopVersions(appId, versionCount)).to.be.rejectedWith(
      FirebaseError,
      /Failed to fetch the top versions/,
    );
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";
    const versionCount = 10;

    await expect(listTopVersions(invalidAppId, versionCount)).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });
});
