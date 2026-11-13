import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";

import { command } from "./crashlytics-issues-get";
import * as commandUtils from "../crashlytics/commandUtils";
import * as issues from "../crashlytics/issues";
import { ErrorType, Issue, Signal, State } from "../crashlytics/types";
import { FirebaseError } from "../error";
import { logger } from "../logger";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("crashlytics:issues:get", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const sampleIssue: Issue = {
    id: "issue_123",
    title: "MainActivity.kt:42",
    subtitle: "java.lang.NullPointerException",
    state: State.OPEN,
    errorType: ErrorType.FATAL,
    firstSeenVersion: "1.0.0",
    lastSeenVersion: "1.2.0",
    signals: [{ signal: Signal.SIGNAL_FRESH, description: "New issue" }],
    notesCount: 2,
    sampleEvent: "projects/1234567890/apps/1:1234567890:android:abcdef1234567890/events/evt_1",
    uri: "https://console.firebase.google.com/project/_/crashlytics",
  };

  let getIssueStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(command, "prepare").resolves();
    (command as unknown as { befores: unknown[] }).befores = [];
    getIssueStub = sinon.stub(issues, "getIssue").resolves(sampleIssue);
    loggerInfoStub = sinon.stub(logger, "info");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should throw FirebaseError when --app is missing", async () => {
    await expect(command.runner()("issue_123", {})).to.be.rejectedWith(
      FirebaseError,
      "Must specify '--app <appId>'",
    );
    expect(getIssueStub.called).to.be.false;
  });

  it("should throw FirebaseError when issueId is empty", async () => {
    await expect(command.runner()("   ", { app: appId })).to.be.rejectedWith(
      FirebaseError,
      "Must specify '<issueId>'.",
    );
    expect(getIssueStub.called).to.be.false;
  });

  it("should fetch the issue, log a summary table, and return the raw Issue", async () => {
    const result = await command.runner()("issue_123", { app: appId });

    expect(getIssueStub.calledOnceWithExactly(appId, "issue_123")).to.be.true;
    expect(result).to.deep.equal(sampleIssue);
    expect(loggerInfoStub.calledOnce).to.be.true;
    const output = String(loggerInfoStub.firstCall.args[0]);
    expect(output).to.include("issue_123");
    expect(output).to.include("MainActivity.kt:42");
    expect(output).to.include("SIGNAL_FRESH");
  });

  it("should write raw JSON to file and skip table output when --output is set", async () => {
    const writeStub = sinon.stub(commandUtils, "writeOutputFileIfRequested").resolves(true);

    const result = await command.runner()("issue_123", {
      app: appId,
      output: "/tmp/issue.json",
    });

    expect(writeStub.calledOnceWithExactly(sampleIssue, sinon.match({ output: "/tmp/issue.json" })))
      .to.be.true;
    expect(loggerInfoStub.called).to.be.false;
    expect(result).to.deep.equal(sampleIssue);
  });

  it("should skip empty rows when issue only has an id", async () => {
    const minimalIssue: Issue = { id: "issue_minimal", signals: [] };
    getIssueStub.resolves(minimalIssue);

    const result = await command.runner()("issue_minimal", { app: appId });

    expect(result).to.deep.equal(minimalIssue);
    expect(loggerInfoStub.calledOnce).to.be.true;
    const output = String(loggerInfoStub.firstCall.args[0]);
    expect(output).to.include("Issue ID");
    expect(output).to.include("issue_minimal");
    expect(output).to.not.include("Title");
    expect(output).to.not.include("Subtitle");
    expect(output).to.not.include("Signals");
    expect(output).to.not.include("Notes Count");
    expect(output).to.not.include("Console URI");
  });
});
