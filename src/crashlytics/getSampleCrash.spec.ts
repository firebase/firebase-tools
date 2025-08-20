import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { getSampleCrash } from "./getSampleCrash";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("getSampleCrash", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectNumber = "1234567890";
  const issueId = "test_issue_id";
  const variantId = "test_variant_id";
  const sampleCount = 10;

  afterEach(() => {
    nock.cleanAll();
  });

  it("should resolve with the response body on success", async () => {
    const mockResponse = { events: [{ event_id: "1" }] };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/events`)
      .query({
        "filter.issue.id": issueId,
        page_size: String(sampleCount),
      })
      .reply(200, mockResponse);

    const result = await getSampleCrash(appId, issueId, sampleCount, undefined);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should resolve with the response body on success with variantId", async () => {
    const mockResponse = { events: [{ event_id: "1" }] };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/events`)
      .query({
        "filter.issue.id": issueId,
        "filter.issue.variant_id": variantId,
        page_size: String(sampleCount),
      })
      .reply(200, mockResponse);

    const result = await getSampleCrash(appId, issueId, sampleCount, variantId);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the API call fails", async () => {
    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/events`)
      .query({
        "filter.issue.id": issueId,
        page_size: String(sampleCount),
      })
      .reply(500, { error: "Internal Server Error" });

    await expect(getSampleCrash(appId, issueId, sampleCount, undefined)).to.be.rejectedWith(
      FirebaseError,
      /Failed to fetch the same crash/,
    );
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";

    await expect(getSampleCrash(invalidAppId, issueId, sampleCount, undefined)).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });
});
