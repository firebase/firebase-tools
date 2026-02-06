import { expect } from "chai";

import { getNextRun } from "./scheduleExpression";

describe("scheduleExpression", () => {
  const FROM = new Date("2026-02-06T00:00:00.000Z");

  it("parses cron expressions", () => {
    const next = getNextRun("*/5 * * * *", FROM, "UTC");
    expect(next).to.deep.equal(new Date("2026-02-06T00:05:00.000Z"));
  });

  it("parses 'every N minutes'", () => {
    const next = getNextRun("every 5 minutes", FROM, "UTC");
    expect(next).to.deep.equal(new Date("2026-02-06T00:05:00.000Z"));
  });

  it("parses 'every N hours'", () => {
    const next = getNextRun("every 2 hours", FROM, "UTC");
    expect(next).to.deep.equal(new Date("2026-02-06T02:00:00.000Z"));
  });

  it("parses 'every mon HH:MM'", () => {
    const next = getNextRun("every mon 07:00", FROM, "UTC");
    expect(next).to.deep.equal(new Date("2026-02-09T07:00:00.000Z"));
  });

  it("parses 'every day HH:MM'", () => {
    const next = getNextRun("every day 07:00", FROM, "UTC");
    expect(next).to.deep.equal(new Date("2026-02-06T07:00:00.000Z"));
  });

  it("supports timezone-aware schedules", () => {
    const next = getNextRun("0 0 * * *", FROM, "America/Los_Angeles");
    expect(next).to.deep.equal(new Date("2026-02-06T08:00:00.000Z"));
  });

  it("returns undefined for unsupported schedules", () => {
    const next = getNextRun("every weekday", FROM);
    expect(next).to.be.undefined;
  });

  it("returns undefined for invalid schedules", () => {
    const next = getNextRun("not-a-cron", FROM);
    expect(next).to.be.undefined;
  });
});
