import { expect } from "chai";
import * as sinon from "sinon";
import { batch_get_events, list_events } from "./events";
import * as crashlyticsEvents from "../../../crashlytics/events";
import { Event, Frame } from "../../../crashlytics/types";

describe("crashlytics events tools", () => {
  const appId = "1:123456789:android:abcdef";
  const ctx = {} as any;

  function eventWithFrames(count: number): Event {
    const frames: Frame[] = Array.from({ length: count }, (_, i) => ({
      symbol: `frame${i + 1}`,
      file: "Main.kt",
      line: i + 1,
    })) as Frame[];
    return {
      exceptions: [{ type: "java.lang.RuntimeException", exceptionMessage: "boom", frames }],
    } as unknown as Event;
  }

  afterEach(() => {
    sinon.restore();
  });

  describe("list_events", () => {
    it("truncates stack traces to 20 frames by default", async () => {
      sinon.stub(crashlyticsEvents, "listEvents").resolves({ events: [eventWithFrames(25)] });

      const result = await list_events.fn(
        { appId, filter: { issueId: "issue-1" }, pageSize: 1 },
        ctx,
      );

      const text = (result.content[0] as { text: string }).text;
      expect(text).to.include("at frame19 ");
      expect(text).to.not.include("at frame20 ");
      expect(text).to.include("... frames omitted ...");
    });

    it("includes more frames when maxFrames is raised", async () => {
      sinon.stub(crashlyticsEvents, "listEvents").resolves({ events: [eventWithFrames(25)] });

      const result = await list_events.fn(
        { appId, filter: { issueId: "issue-1" }, pageSize: 1, maxFrames: 100 },
        ctx,
      );

      const text = (result.content[0] as { text: string }).text;
      expect(text).to.include("at frame25 ");
      expect(text).to.not.include("... frames omitted ...");
    });
  });

  describe("batch_get_events", () => {
    it("passes maxFrames through to the formatted stack traces", async () => {
      sinon.stub(crashlyticsEvents, "batchGetEvents").resolves({ events: [eventWithFrames(25)] });

      const result = await batch_get_events.fn({ appId, names: ["events/e1"], maxFrames: 5 }, ctx);

      const text = (result.content[0] as { text: string }).text;
      expect(text).to.include("at frame4 ");
      expect(text).to.not.include("at frame5 ");
      expect(text).to.include("... frames omitted ...");
    });
  });
});
