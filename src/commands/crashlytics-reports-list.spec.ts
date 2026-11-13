import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";

import { command } from "./crashlytics-reports-list";
import * as commandUtils from "../crashlytics/commandUtils";
import * as reports from "../crashlytics/reports";
import { ListReportsResponse } from "../crashlytics/types";
import { FirebaseError } from "../error";
import { logger } from "../logger";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("crashlytics:reports:list", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const sampleResponse: ListReportsResponse = {
    reports: [
      {
        name: `projects/1234567890/apps/${appId}/reports/topIssues`,
        displayName: "Top Issues",
        usage: "Metrics grouped by issue.",
      },
      {
        name: `projects/1234567890/apps/${appId}/reports/webMetrics`,
        displayName: "Web Metrics",
        usage: "Deprecated: use appSummary instead.",
      },
    ],
  };

  let listReportsStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;

  function loggedOutput(): string {
    return loggerInfoStub.args.map((args: unknown[]) => args.join(" ")).join("\n");
  }

  beforeEach(() => {
    sinon.stub(command, "prepare").resolves();
    (command as unknown as { befores: unknown[] }).befores = [];
    listReportsStub = sinon.stub(reports, "listReports").resolves(sampleResponse);
    loggerInfoStub = sinon.stub(logger, "info");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should print short report IDs, display names, and usage, and return the raw response", async () => {
    const result = await command.runner()({ app: appId });

    expect(listReportsStub.calledOnceWithExactly(appId)).to.be.true;
    const output = loggedOutput();
    expect(output).to.include("topIssues");
    expect(output).to.include("Top Issues");
    expect(output).to.include("Metrics grouped by issue.");
    expect(output).to.include("webMetrics");
    expect(output).to.include("Deprecated: use appSummary instead.");
    expect(output).to.not.include("projects/");
    expect(output).to.include(
      `Run 'firebase crashlytics:reports:get --app ${appId} <report>' to get a report.`,
    );
    expect(result).to.deep.equal(sampleResponse);
  });

  it("should trim whitespace around --app", async () => {
    await command.runner()({ app: `  ${appId}  ` });

    expect(listReportsStub.calledOnceWithExactly(appId)).to.be.true;
  });

  it("should log an empty-state message when no reports are returned", async () => {
    listReportsStub.resolves({ reports: [] });

    const result = await command.runner()({ app: appId });

    expect(loggedOutput()).to.include(`No Crashlytics reports are available for app ${appId}.`);
    expect(result).to.deep.equal({ reports: [] });
  });

  it("should throw a FirebaseError and skip the API call when --app is missing", async () => {
    await expect(command.runner()({})).to.be.rejectedWith(
      FirebaseError,
      "Must specify '--app <appId>'",
    );
    expect(listReportsStub.called).to.be.false;
  });

  it("should write raw JSON and skip the table when --output is set", async () => {
    const writeStub = sinon.stub(commandUtils, "writeOutputFileIfRequested").resolves(true);

    const result = await command.runner()({ app: appId, output: "/tmp/reports.json" });

    expect(writeStub.calledOnce).to.be.true;
    expect(writeStub.firstCall.args[0]).to.deep.equal(sampleResponse);
    expect(loggerInfoStub.called).to.be.false;
    expect(result).to.deep.equal(sampleResponse);
  });
});
