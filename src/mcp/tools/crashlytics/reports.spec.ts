import { expect } from "chai";
import * as sinon from "sinon";
import * as reports from "../../../crashlytics/reports";
import { TimeGranularity } from "../../../crashlytics/types";
import { McpContext } from "../../types";
import { get_report } from "./reports";

const APP_ID = "1:1234567890:android:abcdef1234567890";
const WEB_APP_ID = "1:1234567890:web:abcdef1234567890";
const MOCK_CONTEXT = {} as McpContext;

describe("crashlytics get_report tool", () => {
  let sandbox: sinon.SinonSandbox;
  let getReportStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    getReportStub = sandbox.stub(reports, "getReport");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("get_report", () => {
    it("mentions custom-key filtering, topCustomKeys, and report usage in description", () => {
      expect(get_report.mcp.description).to.include("topCustomKeys");
      expect(get_report.mcp.description).to.include("filterExpression");
      expect(get_report.mcp.description).to.include("report's `usage`");
      expect(get_report.mcp.description).to.not.include("filter_expression");
    });

    it("requires appId", async () => {
      const result = await get_report.fn(
        { appId: "", report: "topIssues", pageSize: 10 },
        MOCK_CONTEXT,
      );

      expect(result.isError).to.be.true;
      expect(result.content[0]).to.deep.equal({
        type: "text",
        text: "Must specify 'appId' parameter",
      });
      expect(getReportStub.called).to.be.false;
    });

    it("returns an error when filter validation fails", async () => {
      const result = await get_report.fn(
        {
          appId: APP_ID,
          report: "topIssues",
          filter: { versionDisplayNames: ["1.0.0"] },
          pageSize: 10,
        },
        MOCK_CONTEXT,
      );

      expect(result.isError).to.be.true;
      expect((result.content[0] as { text: string }).text).to.include(
        "Error: versionDisplayNames must match pattern 'version (build)'",
      );
      expect(getReportStub.called).to.be.false;
    });

    it("forwards filterExpression and granularity to getReport and formats response", async () => {
      getReportStub.resolves({
        name: `projects/1234567890/apps/${WEB_APP_ID}/reports/topCustomKeys`,
        usage: "Filtering by custom keys via filterExpression is supported.",
        groups: [
          {
            customAttribute: { key: "env", value: "prod" },
            metrics: [
              {
                startTime: "2026-11-01T00:00:00Z",
                endTime: "2026-11-08T00:00:00Z",
                eventsCount: 12,
                impactedUsersCount: 4,
                impactedSessionsCount: 6,
              },
            ],
            subgroups: [],
          },
        ],
      });
      const filterExpression = 'custom_keys.env = "prod"';

      const result = await get_report.fn(
        {
          appId: WEB_APP_ID,
          report: "topCustomKeys",
          filter: { issueId: "issue-1", versionDisplayNames: ["1.0.0"] },
          filterExpression,
          pageSize: 5,
          granularity: TimeGranularity.TIME_GRANULARITY_DAY,
        },
        MOCK_CONTEXT,
      );

      expect(result.isError).to.be.undefined;
      expect(
        getReportStub.calledOnceWithExactly(
          "topCustomKeys",
          WEB_APP_ID,
          { issueId: "issue-1", versionDisplayNames: ["1.0.0"] },
          5,
          TimeGranularity.TIME_GRANULARITY_DAY,
          filterExpression,
        ),
      ).to.be.true;
      const text = (result.content[0] as { text: string }).text;
      expect(text).to.include("topCustomKeys");
      expect(text).to.include("Filtering by custom keys via filterExpression is supported.");
      expect(text).to.include("key: env");
    });

    it("sets usage to an empty-results message when report has no groups", async () => {
      getReportStub.resolves({
        name: `projects/1234567890/apps/${APP_ID}/reports/topIssues`,
        usage: "Top issues usage",
        groups: [],
      });

      const result = await get_report.fn(
        { appId: APP_ID, report: "topIssues", pageSize: 10 },
        MOCK_CONTEXT,
      );

      expect(result.isError).to.be.undefined;
      expect((result.content[0] as { text: string }).text).to.include(
        "This report response contains no results.",
      );
    });

    it("returns an error when getReport rejects", async () => {
      getReportStub.rejects(new Error("Invalid Crashlytics report: unknown"));

      const result = await get_report.fn(
        { appId: APP_ID, report: "unknown", pageSize: 10 },
        MOCK_CONTEXT,
      );

      expect(result.isError).to.be.true;
      expect(result.content).to.deep.equal([
        {
          type: "text",
          text: "Error: Invalid Crashlytics report: unknown",
        },
      ]);
    });
  });
});
