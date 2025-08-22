import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { listTopDevices } from "./listTopDevices";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("listTopDevices", () => {
  const androidAppId = "1:1234567890:android:abcdef1234567890";
  const appleAppId = "1:1234567890:ios:abcdef1234567890";

  const requestProjectNumber = "1234567890";

  afterEach(() => {
    nock.cleanAll();
  });

  it("for Android app, should resolve with the response body on success", async () => {
    const deviceCount = 10;
    const mockResponse = { devices: [{ device: "Pixel 4" }] };

    nock(crashlyticsApiOrigin())
      .get(
        `/v1alpha/projects/${requestProjectNumber}/apps/${androidAppId}/reports/topAndroidDevices`,
      )
      .query({
        page_size: `${deviceCount}`,
      })
      .reply(200, mockResponse);

    const result = await listTopDevices(androidAppId, deviceCount);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("for Apple app, should resolve with the response body on success", async () => {
    const deviceCount = 10;
    const mockResponse = { devices: [{ device: "Pixel 4" }] };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appleAppId}/reports/topAppleDevices`)
      .query({
        page_size: `${deviceCount}`,
      })
      .reply(200, mockResponse);

    const result = await listTopDevices(appleAppId, deviceCount);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("for Android app, should resolve with the response body on success with issueId", async () => {
    const deviceCount = 10;
    const issueId = "test-issue-id";
    const mockResponse = { devices: [{ device: "Pixel 4" }] };

    nock(crashlyticsApiOrigin())
      .get(
        `/v1alpha/projects/${requestProjectNumber}/apps/${androidAppId}/reports/topAndroidDevices`,
      )
      .query({
        page_size: `${deviceCount}`,
        "filter.issue.id": issueId,
      })
      .reply(200, mockResponse);

    const result = await listTopDevices(androidAppId, deviceCount, issueId);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the API call fails", async () => {
    const deviceCount = 10;

    nock(crashlyticsApiOrigin())
      .get(
        `/v1alpha/projects/${requestProjectNumber}/apps/${androidAppId}/reports/topAndroidDevices`,
      )
      .reply(500, { error: "Internal Server Error" });

    await expect(listTopDevices(androidAppId, deviceCount)).to.be.rejectedWith(
      FirebaseError,
      /Failed to fetch the top devices/,
    );
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";
    const deviceCount = 10;

    await expect(listTopDevices(invalidAppId, deviceCount)).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });

  it("should throw a FirebaseError if the appId doesn't have a platform", async () => {
    const invalidAppId = "1:1234567890";
    const deviceCount = 10;

    await expect(listTopDevices(invalidAppId, deviceCount)).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the platform from the AppId.",
    );
  });

  it("should throw a FirebaseError if the appId is a web app", async () => {
    const invalidAppId = "1:1234567890:web:abcdef1234567890";
    const deviceCount = 10;

    await expect(listTopDevices(invalidAppId, deviceCount)).to.be.rejectedWith(
      FirebaseError,
      "Only android or ios apps are supported.",
    );
  });
});
