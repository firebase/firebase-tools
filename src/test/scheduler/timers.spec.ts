import { expect } from "chai";
import { ScheduledEmulator } from "../../emulator/scheduledEmulator";

describe("scheduler-timers", () => {
  let emulator: ScheduledEmulator;

  beforeEach(() => {
    emulator = new ScheduledEmulator({ projectId: "test" });
  });

  it("should create a new timer for a valid text expression", () => {
    emulator.createTimer("test", "every 1 second", () => {
      // Do nothing
    });
    expect(emulator["timers"].size).to.equal(1);
  });

  it("should throw an error for an invalid text expression", () => {
    expect(() => {
      emulator.createTimer("test", "hello world", () => {
        // Do nothing
      });
    }).to.throw();
  });

  it("should create a new timer for a valid cron expression", () => {
    emulator.createTimer("test", "* * * * * *", () => {
      // Do nothing
    });
    expect(emulator["timers"].size).to.equal(1);
  });

  it("should throw an error for an invalid cron expression", () => {
    expect(() => {
      emulator.createTimer("test", "* * * *", () => {
        // Do nothing
      });
    }).to.throw();
  });

  it("should clear all timers", () => {
    emulator.createTimer("test", "every 1 second", () => {
      // Do nothing
    });
    expect(emulator["timers"].size).to.equal(1);
    emulator.clearTimers();
    expect(emulator["timers"].size).to.equal(0);
  });
});
