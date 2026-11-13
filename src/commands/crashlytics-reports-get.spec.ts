import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";

import { command, REPORTS_REQUIRING_ISSUE_ID } from "./crashlytics-reports-get";
import * as commandUtils from "../crashlytics/commandUtils";
import * as reports from "../crashlytics/reports";
import { ErrorType, IntervalMetrics, Report } from "../crashlytics/types";
import { FirebaseError } from "../error";
import { logger } from "../logger";

chai.use(chaiAsPromised);
const expect = chai.expect;

function metrics(values: Partial<IntervalMetrics>): IntervalMetrics[] {
  return [
    {
      startTime: "2026-11-01T00:00:00Z",
      endTime: "2026-11-08T00:00:00Z",
      eventsCount: 0,
      impactedUsersCount: 0,
      ...values,
    } as IntervalMetrics,
  ];
}

describe("crashlytics:reports:get", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const webAppId = "1:1234567890:web:abcdef1234567890";
  const topIssuesReport: Report = {
    name: `projects/1234567890/apps/${appId}/reports/topIssues`,
    displayName: "Top Issues",
    totalSize: 25,
    groups: [
      {
        issue: {
          id: "issue_1",
          title: "MainActivity.onCreate",
          errorType: ErrorType.FATAL,
          sampleEvent: `projects/1234567890/apps/${appId}/events/sess1_evt1`,
        },
        metrics: metrics({ eventsCount: 120, impactedUsersCount: 45 }),
        subgroups: [],
      },
    ],
  };

  let getReportStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;

  function loggedOutput(): string {
    return loggerInfoStub.args.map((args: unknown[]) => args.join(" ")).join("\n");
  }

  beforeEach(() => {
    sinon.stub(command, "prepare").resolves();
    (command as unknown as { befores: unknown[] }).befores = [];
    getReportStub = sinon.stub(reports, "getReport").resolves(topIssuesReport);
    loggerInfoStub = sinon.stub(logger, "info");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should throw when --app is missing", async () => {
    await expect(command.runner()("topIssues", {})).to.be.rejectedWith(
      FirebaseError,
      "Must specify '--app <appId>'",
    );
    expect(getReportStub.called).to.be.false;
  });

  it("should require --issue-id for issue-scoped reports", async () => {
    for (const report of REPORTS_REQUIRING_ISSUE_ID) {
      await expect(command.runner()(report, { app: appId })).to.be.rejectedWith(
        FirebaseError,
        `The '${report}' report requires '--issue-id <id>'`,
      );
    }
    expect(getReportStub.called).to.be.false;
  });

  it("should reject --issue-id for the topIssues report and point to issues:get", async () => {
    await expect(
      command.runner()("topIssues", { app: appId, issueId: "issue_1" }),
    ).to.be.rejectedWith(
      FirebaseError,
      `Run 'firebase crashlytics:issues:get --app ${appId} issue_1' to inspect a single issue.`,
    );
    expect(getReportStub.called).to.be.false;
  });

  it("should reject --limit outside 1-100", async () => {
    for (const limit of ["0", "101"]) {
      await expect(command.runner()("topIssues", { app: appId, limit })).to.be.rejectedWith(
        FirebaseError,
        "--limit",
      );
    }
    expect(getReportStub.called).to.be.false;
  });

  it("should pass the report name, parsed filters, and limit to getReport", async () => {
    await command.runner()("topIssues", {
      app: appId,
      limit: "5",
      errorTypes: "FATAL",
      versions: "1.2.0 (12)",
    });

    expect(
      getReportStub.calledOnceWithExactly(
        "topIssues",
        appId,
        sinon.match({ issueErrorTypes: ["FATAL"], versionDisplayNames: ["1.2.0 (12)"] }),
        5,
      ),
    ).to.be.true;
  });

  it("should default --limit to 10", async () => {
    await command.runner()("topIssues", { app: appId });

    expect(getReportStub.firstCall.args[3]).to.equal(10);
  });

  it("should add a reports:list hint when the report name is invalid", async () => {
    getReportStub.rejects(
      new FirebaseError("Invalid Crashlytics report: topissue. Valid reports are:\n  * topIssues"),
    );

    await expect(command.runner()("topissue", { app: appId })).to.be.rejectedWith(
      FirebaseError,
      `Run 'firebase crashlytics:reports:list --app ${appId}' for report descriptions.`,
    );
  });

  it("should render issue groups with sample events, a paging hint, and an events:get hint", async () => {
    const result = await command.runner()("topIssues", { app: appId });

    const output = loggedOutput();
    expect(output).to.include("Top Issues");
    expect(output).to.include("issue_1");
    expect(output).to.include("MainActivity.onCreate");
    expect(output).to.include("FATAL");
    expect(output).to.include("sess1_evt1");
    expect(output).to.include("120");
    expect(output).to.include("45");
    expect(output).to.include("Showing 1 of 25 groups");
    expect(output).to.include("crashlytics:events:get");
    expect(result).to.deep.equal(topIssuesReport);
  });

  it("should render ungrouped appSummary metrics including crash-free percentages", async () => {
    getReportStub.resolves({
      groups: [
        {
          metrics: metrics({
            eventsCount: 10,
            impactedUsersCount: 4,
            totalUsersCount: 800,
            crashFreeUsersPercentage: 99.5,
          }),
          subgroups: [],
        },
      ],
    });

    await command.runner()("appSummary", { app: appId });

    const output = loggedOutput();
    expect(output).to.include("Crash-Free Users");
    expect(output).to.include("99.50%");
    expect(output).to.include("800");
    expect(output).to.not.include("Crash-Free Sessions");
  });

  it("should render web browser groups without mobile-only metric columns", async () => {
    getReportStub.resolves({
      groups: [
        {
          browser: { displayName: "Chrome (123)" },
          metrics: metrics({ eventsCount: 9, impactedUsersCount: 3, impactedSessionsCount: 7 }),
          subgroups: [],
        },
      ],
    });

    await command.runner()("topBrowsers", { app: webAppId, issueId: "issue_1" });

    const output = loggedOutput();
    expect(output).to.include("Chrome (123)");
    expect(output).to.include("Impacted Sessions");
    expect(output).to.not.include("Crash-Free");
  });

  it("should render custom key groups as key and value columns", async () => {
    getReportStub.resolves({
      groups: [
        {
          customAttribute: { key: "env", value: "prod" },
          metrics: metrics({ eventsCount: 5, impactedUsersCount: 2 }),
          subgroups: [],
        },
      ],
    });

    await command.runner()("topCustomKeys", { app: webAppId, issueId: "issue_1" });

    const output = loggedOutput();
    expect(output).to.include("Key");
    expect(output).to.include("env");
    expect(output).to.include("prod");
  });

  it("should log an empty-state message when there are no groups", async () => {
    getReportStub.resolves({ groups: [] });

    const result = await command.runner()("topIssues", { app: appId });

    expect(loggedOutput()).to.include(
      "No results for the 'topIssues' report with the given filters.",
    );
    expect(result).to.deep.equal({ groups: [] });
  });

  it("should write raw JSON and skip the table when --output is set", async () => {
    const writeStub = sinon.stub(commandUtils, "writeOutputFileIfRequested").resolves(true);

    const result = await command.runner()("topIssues", { app: appId, output: "/tmp/report.json" });

    expect(writeStub.firstCall.args[0]).to.deep.equal(topIssuesReport);
    expect(loggerInfoStub.called).to.be.false;
    expect(result).to.deep.equal(topIssuesReport);
  });
});
