import { expect } from "chai";

import { formatLogEntries } from "./formatter";
import { LogEntry } from "../../../gcp/cloudlogging";

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    logName: "projects/test/logs/run.googleapis.com%2Fstdout",
    resource: {
      type: "cloud_run_revision",
      labels: {
        function_name: "helloWorld",
      },
    },
    receiveTimestamp: "2024-01-01T00:00:00Z",
    severity: "INFO",
    textPayload: "Function execution started\n    at handler (/workspace/index.js:10:5)",
    ...overrides,
  };
}

describe("formatLogEntries", () => {
  it("summarizes entries and returns structured output", () => {
    const entries: LogEntry[] = [
      makeEntry({ timestamp: "2024-01-01T00:00:00Z" }),
      makeEntry({
        timestamp: "2024-01-01T01:00:00Z",
        severity: "ERROR",
        resource: {
          type: "cloud_function",
          labels: { function_name: "scheduled" },
        },
      }),
    ];

    const formatted = formatLogEntries(entries, {
      filter: "test",
      order: "asc",
      page_size: 2,
      nextPageToken: "NEXT",
    });

    expect(formatted.summary.total).to.equal(2);
    expect(formatted.summary.window).to.deep.equal({
      earliest: "2024-01-01T00:00:00Z",
      latest: "2024-01-01T01:00:00Z",
    });
    expect(formatted.summary.severity_counts.INFO).to.equal(1);
    expect(formatted.summary.severity_counts.ERROR).to.equal(1);
    expect(formatted.summary.function_counts.helloWorld).to.equal(1);
    expect(formatted.summary.function_counts.scheduled).to.equal(1);
    expect(formatted.entries).to.have.length(2);
    expect(formatted.entries[0].stack).to.have.length(1);
    expect(formatted.context.next_page_token).to.equal("NEXT");
    expect(formatted.context.has_more).to.equal(true);
  });

  it("truncates long messages and preserves fields", () => {
    const entries: LogEntry[] = [
      makeEntry({
        textPayload: "a".repeat(500),
        jsonPayload: { foo: "bar" },
      }),
    ];

    const formatted = formatLogEntries(entries, {
      filter: "test",
      order: "asc",
      page_size: 1,
    });

    expect(formatted.entries[0].message.length).to.equal(400);
    expect(formatted.entries[0].truncated_message).to.equal(true);
    expect(formatted.entries[0].fields).to.deep.equal({ foo: "bar" });
  });

  it("normalizes order by reversing descending results", () => {
    const entries: LogEntry[] = [
      makeEntry({ timestamp: "2024-01-02T00:00:00Z" }),
      makeEntry({ timestamp: "2024-01-01T00:00:00Z" }),
    ];

    const formatted = formatLogEntries(entries, {
      filter: "test",
      order: "desc",
      page_size: 2,
    });

    expect(formatted.entries[0].timestamp).to.equal("2024-01-01T00:00:00Z");
    expect(formatted.entries[1].timestamp).to.equal("2024-01-02T00:00:00Z");
  });
});
