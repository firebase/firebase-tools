import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";

import { command } from "./crashlytics-events-list";
import * as commandUtils from "../crashlytics/commandUtils";
import * as events from "../crashlytics/events";
import { ErrorType, Event, ListEventsResponse } from "../crashlytics/types";
import { FirebaseError } from "../error";
import { logger } from "../logger";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("crashlytics:events:list", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const sampleEvent: Event = {
    eventId: "evt_1",
    issue: { id: "issue_1", errorType: ErrorType.FATAL },
    threads: [
      {
        name: "main",
        crashed: true,
        frames: [{ symbol: "com.example.Main.crash", file: "Main.kt", line: 10 }],
      },
    ],
  };
  const sampleResponse: ListEventsResponse = {
    events: [sampleEvent],
  };

  let listEventsStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(command, "prepare").resolves();
    (command as unknown as { befores: unknown[] }).befores = [];
    listEventsStub = sinon.stub(events, "listEvents").resolves(sampleResponse);
    loggerInfoStub = sinon.stub(logger, "info");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should require --issue-id, even when --variant-id is set", async () => {
    for (const app of [appId, "1:1234567890:web:abcdef", "1:1234567890:macos:abcdef"]) {
      await expect(command.runner()({ app })).to.be.rejectedWith(
        FirebaseError,
        "Must specify '--issue-id <id>' to list events.",
      );
    }
    await expect(command.runner()({ app: appId, variantId: "variant_1" })).to.be.rejectedWith(
      FirebaseError,
      "Must specify '--issue-id <id>' to list events.",
    );
    expect(listEventsStub.called).to.be.false;
  });

  it("should reject --limit 0 and --limit 101", async () => {
    await expect(
      command.runner()({ app: appId, issueId: "issue_1", limit: "0" }),
    ).to.be.rejectedWith(FirebaseError, "'--limit' must be a positive integer.");
    await expect(
      command.runner()({ app: appId, issueId: "issue_1", limit: "101" }),
    ).to.be.rejectedWith(FirebaseError, "'--limit' must be between 1 and 100.");
    expect(listEventsStub.called).to.be.false;
  });

  it("should pass --max-frames and --full to events.toText", async () => {
    const toTextStub = sinon.stub(events, "toText").returns({ eventId: "evt_1" });

    await command.runner()({
      app: appId,
      issueId: "issue_1",
      maxFrames: "5",
      full: true,
    });

    expect(
      toTextStub.calledOnceWithExactly(sampleEvent, {
        maxFrames: 5,
        full: true,
      }),
    ).to.be.true;
  });

  it("should list events with default limit=1 and pass --filter expression", async () => {
    const result = await command.runner()({
      app: appId,
      issueId: "issue_1",
      filter: 'custom_keys.env = "prod"',
    });

    expect(
      listEventsStub.calledOnceWithExactly(
        appId,
        sinon.match({ issueId: "issue_1" }),
        1,
        'custom_keys.env = "prod"',
      ),
    ).to.be.true;
    expect(result).to.deep.equal(sampleResponse);
    expect(loggerInfoStub.calledOnce).to.be.true;
    expect(String(loggerInfoStub.firstCall.args[0])).to.include("com.example.Main.crash");
  });

  it("should append --help hint when --filter fails with HTTP 400", async () => {
    listEventsStub.rejects(
      new FirebaseError("Request contains an invalid argument.", { status: 400 }),
    );

    await expect(
      command.runner()({
        app: appId,
        issueId: "issue_1",
        filter: "invalid_filter",
      }),
    ).to.be.rejectedWith(
      FirebaseError,
      "See 'firebase crashlytics:events:list --help' for --filter syntax and examples.",
    );
  });

  it("should log empty state message when no events match", async () => {
    listEventsStub.resolves({ events: [] });

    const result = await command.runner()({ app: appId, issueId: "issue_1" });

    expect(result).to.deep.equal({ events: [] });
    expect(loggerInfoStub.calledOnceWithExactly("No matching events found.")).to.be.true;
  });

  it("should write raw JSON and skip terminal output when --output is set", async () => {
    const writeStub = sinon.stub(commandUtils, "writeOutputFileIfRequested").resolves(true);

    const result = await command.runner()({
      app: appId,
      issueId: "issue_1",
      output: "/tmp/events.json",
    });

    expect(writeStub.calledOnce).to.be.true;
    expect(loggerInfoStub.called).to.be.false;
    expect(result).to.deep.equal(sampleResponse);
  });
});
