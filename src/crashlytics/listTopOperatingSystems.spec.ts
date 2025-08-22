import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { listTopOperatingSystems } from "./listTopOperatingSystems";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("listTopOperatingSystems", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectNumber = "1234567890";

  afterEach(() => {
    nock.cleanAll();
  });

  it("should resolve with the response body on success", async () => {
    const osCount = 10;
    const mockResponse = { operatingSystems: [{ os: "Android 12" }] };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/topOperatingSystems`)
      .query({
        page_size: `${osCount}`,
      })
      .reply(200, mockResponse);

    const result = await listTopOperatingSystems(appId, osCount);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should resolve with the response body on success with issueId", async () => {
    const osCount = 10;
    const issueId = "test-issue-id";
    const mockResponse = { operatingSystems: [{ os: "Android 12" }] };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/topOperatingSystems`)
      .query({
        page_size: `${osCount}`,
        "filter.issue.id": issueId,
      })
      .reply(200, mockResponse);

    const result = await listTopOperatingSystems(appId, osCount, issueId);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the API call fails", async () => {
    const osCount = 10;

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/topOperatingSystems`)
      .reply(500, { error: "Internal Server Error" });

    await expect(listTopOperatingSystems(appId, osCount)).to.be.rejectedWith(
      FirebaseError,
      /Failed to fetch the top operating systems/,
    );
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";
    const osCount = 10;

    await expect(listTopOperatingSystems(invalidAppId, osCount)).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });
});
