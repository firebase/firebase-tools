import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";

import { command } from "./crashlytics-events-get";
import * as commandUtils from "../crashlytics/commandUtils";
import * as events from "../crashlytics/events";
import { BatchGetEventsResponse, ErrorType, Event } from "../crashlytics/types";
import { FirebaseError } from "../error";
import { logger } from "../logger";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("crashlytics:events:get", () => {
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
  const sampleResponse: BatchGetEventsResponse = {
    events: [sampleEvent],
  };

  let batchGetEventsStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(command, "prepare").resolves();
    (command as unknown as { befores: unknown[] }).befores = [];
    batchGetEventsStub = sinon.stub(events, "batchGetEvents").resolves(sampleResponse);
    loggerInfoStub = sinon.stub(logger, "info");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should expand short event IDs and pass full resource names to batchGetEvents", async () => {
    const fullName = `projects/1234567890/apps/${appId}/events/evt_2`;
    const result = await command.runner()(["evt_1", fullName], { app: appId });

    expect(
      batchGetEventsStub.calledOnceWithExactly(appId, [
        `projects/1234567890/apps/${appId}/events/evt_1`,
        fullName,
      ]),
    ).to.be.true;
    expect(result).to.deep.equal(sampleResponse);
    expect(loggerInfoStub.calledOnce).to.be.true;
  });

  it("should throw FirebaseError when no event IDs are provided", async () => {
    await expect(command.runner()([], { app: appId })).to.be.rejectedWith(
      FirebaseError,
      "Must specify at least one '<eventId>'.",
    );
  });

  it("should throw FirebaseError when more than 100 event IDs are provided", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `evt_${i}`);
    await expect(command.runner()(ids, { app: appId })).to.be.rejectedWith(
      FirebaseError,
      "Cannot request more than 100 events in a single call.",
    );
  });

  it("should write raw JSON and skip terminal output when --output is set", async () => {
    const writeStub = sinon.stub(commandUtils, "writeOutputFileIfRequested").resolves(true);

    const result = await command.runner()(["evt_1"], {
      app: appId,
      output: "/tmp/events.json",
    });

    expect(writeStub.calledOnce).to.be.true;
    expect(loggerInfoStub.called).to.be.false;
    expect(result).to.deep.equal(sampleResponse);
  });

  it("should pass --max-frames and --full to events.toText", async () => {
    const toTextStub = sinon.stub(events, "toText").returns({ eventId: "evt_1" });

    await command.runner()(["evt_1"], {
      app: appId,
      maxFrames: "7",
      full: true,
    });

    expect(
      toTextStub.calledOnceWithExactly(sampleEvent, {
        maxFrames: 7,
        full: true,
      }),
    ).to.be.true;
  });
});
