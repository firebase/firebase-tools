import * as chai from "chai";
import nock from "../test/helpers/nock";
import * as chaiAsPromised from "chai-as-promised";

import { CrashlyticsReport, getReport, listReports, simplifyReport } from "./reports";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";
import { Report } from "./types";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("simplifyReport", () => {
  it("should return report unchanged if groups is undefined", () => {
    const report: Report = {
      name: "test",
      displayName: "Test Report",
      totalSize: 0,
      usage: "Test usage",
    };

    const result = simplifyReport(report);
    expect(result).to.deep.equal(report);
  });

  it("should return report unchanged if groups is empty", () => {
    const report: Report = {
      groups: [],
      name: "test",
      displayName: "Test Report",
      totalSize: 0,
      usage: "Test usage",
    };

    const result = simplifyReport(report);
    expect(result).to.deep.equal(report);
  });

  it("should remove device.model and device.manufacturer but keep displayName", () => {
    const report: Report = {
      groups: [
        {
          metrics: [],
          subgroups: [],
          device: {
            model: "Pixel 6",
            manufacturer: "Google",
            displayName: "Google (Pixel 6)",
          },
        },
      ],
      name: "test",
      displayName: "Test Report",
      totalSize: 1,
      usage: "Test usage",
    };

    const result = simplifyReport(report);
    expect(result.groups?.[0].device).to.deep.equal({
      displayName: "Google (Pixel 6)",
    });
    expect(result.groups?.[0].device?.model).to.be.undefined;
    expect(result.groups?.[0].device?.manufacturer).to.be.undefined;
  });

  it("should remove version.buildVersion and version.displayVersion but keep displayName", () => {
    const report: Report = {
      groups: [
        {
          metrics: [],
          subgroups: [],
          version: {
            displayVersion: "1.2.3",
            buildVersion: "123",
            displayName: "1.2.3 (123)",
          },
        },
      ],
      name: "test",
      displayName: "Test Report",
      totalSize: 1,
      usage: "Test usage",
    };

    const result = simplifyReport(report);
    expect(result.groups?.[0].version).to.deep.equal({
      displayName: "1.2.3 (123)",
    });
    expect(result.groups?.[0].version?.displayVersion).to.be.undefined;
    expect(result.groups?.[0].version?.buildVersion).to.be.undefined;
  });

  it("should remove operatingSystem.displayVersion and operatingSystem.os but keep displayName", () => {
    const report: Report = {
      groups: [
        {
          metrics: [],
          subgroups: [],
          operatingSystem: {
            displayVersion: "14.0",
            os: "Android",
            displayName: "Android (14.0)",
          },
        },
      ],
      name: "test",
      displayName: "Test Report",
      totalSize: 1,
      usage: "Test usage",
    };

    const result = simplifyReport(report);
    expect(result.groups?.[0].operatingSystem).to.deep.equal({
      displayName: "Android (14.0)",
    });
    expect(result.groups?.[0].operatingSystem?.displayVersion).to.be.undefined;
    expect(result.groups?.[0].operatingSystem?.os).to.be.undefined;
  });
});

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
      CrashlyticsReport.TOP_ISSUES,
      appId,
      { issueErrorTypes: [issueType] },
      pageSize,
    );

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should resolve with topBrowsers report on success", async () => {
    const mockResponse = { groups: [{ browser: { displayName: "Chrome (123)" } }] };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/topBrowsers`)
      .query({ page_size: "10" })
      .reply(200, mockResponse);

    const result = await getReport(CrashlyticsReport.TOP_BROWSERS, appId, {});

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";

    await expect(getReport(CrashlyticsReport.TOP_ISSUES, invalidAppId, {})).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });

  it("should resolve with appSummary report on success", async () => {
    const mockResponse = { groups: [{ metrics: [{ eventsCount: 10 }] }] };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/appSummary`)
      .query({ page_size: "10" })
      .reply(200, mockResponse);

    const result = await getReport(CrashlyticsReport.APP_SUMMARY, appId, {});

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should resolve with releaseVersions report on success", async () => {
    const mockResponse = { groups: [{ version: { displayName: "1.0.0 (1)" } }] };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/releaseVersions`)
      .query({ page_size: "10" })
      .reply(200, mockResponse);

    const result = await getReport(CrashlyticsReport.RELEASE_VERSIONS, appId, {});

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should resolve with topCustomKeys report on success", async () => {
    const mockResponse = {
      groups: [{ customAttribute: { key: "env", value: "prod" }, metrics: [] }],
    };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/topCustomKeys`)
      .query({ page_size: "10", "filter.issue.id": "issue-1" })
      .reply(200, mockResponse);

    const result = await getReport(CrashlyticsReport.TOP_CUSTOM_KEYS, appId, {
      issueId: "issue-1",
    });

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });
});

describe("listReports", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectNumber = "1234567890";

  afterEach(() => {
    nock.cleanAll();
  });

  it("should resolve with available reports on success", async () => {
    const mockResponse = {
      reports: [
        {
          name: `projects/${requestProjectNumber}/apps/${appId}/reports/appSummary`,
          displayName: "App Summary",
          usage: "High-level health summary.",
        },
      ],
    };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports`)
      .reply(200, mockResponse);

    const result = await listReports(appId);
    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should default reports to an empty array when omitted in API response", async () => {
    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports`)
      .reply(200, {});

    const result = await listReports(appId);
    expect(result).to.deep.equal({ reports: [] });
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    await expect(listReports("invalid-app-id")).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });
});
