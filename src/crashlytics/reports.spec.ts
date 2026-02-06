import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { CrashlyticsReport, getReport, simplifyReport } from "./reports";
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

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";

    await expect(getReport(CrashlyticsReport.TOP_ISSUES, invalidAppId, {})).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });
});
