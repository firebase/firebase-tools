import * as chai from "chai";
import nock from "../test/helpers/nock";
import * as chaiAsPromised from "chai-as-promised";

import { getReport, listReports, reportsCache, simplifyReport } from "./reports";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";
import { Report, TimeGranularity } from "./types";

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
  const mockListReportsResponse = {
    reports: [
      {
        name: `projects/${requestProjectNumber}/apps/${appId}/reports/appSummary`,
        displayName: "App Summary",
        usage: "High-level health summary.",
      },
      {
        name: `projects/${requestProjectNumber}/apps/${appId}/reports/releaseVersions`,
        displayName: "Release Versions",
        usage: "Metrics grouped by release version.",
      },
      {
        name: `projects/${requestProjectNumber}/apps/${appId}/reports/topIssues`,
        displayName: "Top Issues",
        usage: "Metrics grouped by issue.",
      },
      {
        name: `projects/${requestProjectNumber}/apps/${appId}/reports/topBrowsers`,
        displayName: "Top Browsers",
        usage: "Metrics grouped by browser.",
      },
      {
        name: `projects/${requestProjectNumber}/apps/${appId}/reports/topCustomKeys`,
        displayName: "Top Custom Keys",
        usage: "Metrics grouped by custom keys.",
      },
    ],
  };

  function mockListReports(targetAppId = appId, projectNumber = requestProjectNumber): void {
    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${projectNumber}/apps/${targetAppId}/reports`)
      .reply(200, mockListReportsResponse);
  }

  afterEach(() => {
    reportsCache.clear();
    nock.cleanAll();
  });

  it("should call listReports before the first getReport call and cache the response", async () => {
    const mockTopIssues = { groups: [{ issue: { id: "1" }, metrics: [], subgroups: [] }] };
    const mockAppSummary = { groups: [{ metrics: [{ eventsCount: 10 }], subgroups: [] }] };

    mockListReports();
    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/topIssues`)
      .query({ page_size: "10" })
      .reply(200, mockTopIssues);
    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/appSummary`)
      .query({ page_size: "10" })
      .reply(200, mockAppSummary);

    expect(reportsCache.get(appId)).to.be.undefined;

    const firstResult = await getReport("topIssues", appId, {});
    expect(firstResult).to.deep.equal(mockTopIssues);
    expect(reportsCache.get(appId)).to.deep.equal(mockListReportsResponse);

    // Second call for the same appId should reuse the cached listReports response
    const secondResult = await getReport("appSummary", appId, {});
    expect(secondResult).to.deep.equal(mockAppSummary);
    expect(nock.isDone()).to.be.true;
  });

  it("should resolve with the response body on success", async () => {
    const issueType = "FATAL";
    const pageSize = 5;
    const mockResponse = { issues: [{ id: "1" }] };

    mockListReports();
    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/topIssues`)
      .query({
        page_size: `${pageSize}`,
        "filter.issue.error_types": issueType,
      })
      .reply(200, mockResponse);

    const result = await getReport("topIssues", appId, { issueErrorTypes: [issueType] }, pageSize);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should resolve with topBrowsers report on success", async () => {
    const mockResponse = { groups: [{ browser: { displayName: "Chrome (123)" } }] };

    mockListReports();
    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/topBrowsers`)
      .query({ page_size: "10" })
      .reply(200, mockResponse);

    const result = await getReport("topBrowsers", appId, {});

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";

    await expect(getReport("topIssues", invalidAppId, {})).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });

  it("should throw a FirebaseError listing valid reports when reportName is invalid", async () => {
    mockListReports();

    await expect(getReport("nonExistentReport", appId, {})).to.be.rejectedWith(
      FirebaseError,
      /Invalid Crashlytics report: nonExistentReport\. Valid reports are:[\s\S]*appSummary - High-level health summary\.[\s\S]*topIssues - Metrics grouped by issue\./,
    );
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError listing all available reports when reportName is empty", async () => {
    mockListReports();

    await expect(getReport("", appId, {})).to.be.rejectedWith(
      FirebaseError,
      [
        "Invalid Crashlytics report: . Valid reports are:",
        "  * appSummary - High-level health summary.",
        "  * releaseVersions - Metrics grouped by release version.",
        "  * topIssues - Metrics grouped by issue.",
        "  * topBrowsers - Metrics grouped by browser.",
        "  * topCustomKeys - Metrics grouped by custom keys.",
      ].join("\n"),
    );
    expect(nock.isDone()).to.be.true;
  });

  it("should resolve with appSummary report on success", async () => {
    const mockResponse = { groups: [{ metrics: [{ eventsCount: 10 }] }] };

    mockListReports();
    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/appSummary`)
      .query({ page_size: "10" })
      .reply(200, mockResponse);

    const result = await getReport("appSummary", appId, {});

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should resolve with releaseVersions report on success", async () => {
    const mockResponse = { groups: [{ version: { displayName: "1.0.0 (1)" } }] };

    mockListReports();
    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/releaseVersions`)
      .query({ page_size: "10" })
      .reply(200, mockResponse);

    const result = await getReport("releaseVersions", appId, {});

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should resolve with topCustomKeys report on success", async () => {
    const mockResponse = {
      groups: [{ customAttribute: { key: "env", value: "prod" }, metrics: [] }],
    };

    mockListReports();
    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/topCustomKeys`)
      .query({ page_size: "10", "filter.issue.id": "issue-1" })
      .reply(200, mockResponse);

    const result = await getReport("topCustomKeys", appId, {
      issueId: "issue-1",
    });

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should include granularity in query params when provided", async () => {
    const mockResponse = { groups: [{ metrics: [{ eventsCount: 10 }] }] };

    mockListReports();
    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/reports/appSummary`)
      .query({ page_size: "10", granularity: TimeGranularity.TIME_GRANULARITY_DAY })
      .reply(200, mockResponse);

    const result = await getReport(
      "appSummary",
      appId,
      {},
      10,
      TimeGranularity.TIME_GRANULARITY_DAY,
    );

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
