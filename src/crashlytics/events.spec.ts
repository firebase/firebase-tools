import * as chai from "chai";
import nock from "../test/helpers/nock";
import * as chaiAsPromised from "chai-as-promised";

import {
  listEvents,
  batchGetEvents,
  normalizeEventResourceName,
  formatFrames,
  toText,
} from "./events";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";
import { ErrorType, Event, Frame } from "./types";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("events", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectNumber = "1234567890";
  const issueId = "test_issue_id";
  const variantId = "test_variant_id";
  const pageSize = 2;

  afterEach(() => {
    nock.cleanAll();
  });

  describe("listEvents", () => {
    it("should resolve with the response body on success", async () => {
      const mockResponse = { events: [{ event_id: "1" }] };

      nock(crashlyticsApiOrigin())
        .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/events`)
        .query({
          "filter.issue.id": issueId,
          page_size: String(pageSize),
        })
        .reply(200, mockResponse);

      const result = await listEvents(appId, { issueId: issueId }, pageSize);

      expect(result).to.deep.equal(mockResponse);
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve with the response body on success with variantId", async () => {
      const mockResponse = { events: [{ event_id: "1" }] };

      nock(crashlyticsApiOrigin())
        .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/events`)
        .query({
          "filter.issue.id": issueId,
          "filter.issue.variant_id": variantId,
          page_size: String(pageSize),
        })
        .reply(200, mockResponse);

      const result = await listEvents(
        appId,
        { issueId: issueId, issueVariantId: variantId },
        pageSize,
      );

      expect(result).to.deep.equal(mockResponse);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if the appId is invalid", async () => {
      const invalidAppId = "invalid-app-id";

      await expect(
        listEvents(invalidAppId, { issueId: issueId, issueVariantId: variantId }),
      ).to.be.rejectedWith(FirebaseError, "Unable to get the projectId from the AppId.");
    });

    it("should include filter_expression when filterExpression is provided", async () => {
      const mockResponse = { events: [{ eventId: "1" }] };
      const filterExpression = 'custom_keys.env = "prod"';

      nock(crashlyticsApiOrigin())
        .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/events`)
        .query({
          "filter.issue.id": issueId,
          page_size: String(pageSize),
          filter_expression: filterExpression,
        })
        .reply(200, mockResponse);

      const result = await listEvents(appId, { issueId }, pageSize, filterExpression);
      expect(result).to.deep.equal(mockResponse);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("normalizeEventResourceName", () => {
    it("should expand a short event ID into a full resource name", () => {
      expect(normalizeEventResourceName(appId, "event_123")).to.equal(
        `projects/${requestProjectNumber}/apps/${appId}/events/event_123`,
      );
    });

    it("should pass through an existing valid event resource name unchanged", () => {
      const fullName = `projects/${requestProjectNumber}/apps/${appId}/events/event_123`;
      expect(normalizeEventResourceName(appId, fullName)).to.equal(fullName);
    });

    it("should throw FirebaseError for empty or malformed resource names", () => {
      expect(() => normalizeEventResourceName(appId, "   ")).to.throw(
        FirebaseError,
        "Event ID cannot be empty.",
      );
      expect(() => normalizeEventResourceName(appId, "projects/123/events/456")).to.throw(
        FirebaseError,
        "Invalid event resource name",
      );
    });
  });

  describe("formatFrames", () => {
    const makeFrames = (count: number): Frame[] =>
      Array.from({ length: count }, (_, idx) => ({
        symbol: `com.example.App.fn${idx}`,
        file: "App.kt",
        line: idx + 1,
      }));

    it("should truncate to 20 frames with an omission marker by default", () => {
      const formatted = formatFrames(makeFrames(25));
      expect(formatted).to.have.length(20);
      expect(formatted[0]).to.equal("at com.example.App.fn0 (App.kt:1)");
      expect(formatted[19]).to.equal("... frames omitted ...");
    });

    it("should respect a custom maxFrames", () => {
      const formatted = formatFrames(makeFrames(25), 5);
      expect(formatted).to.have.length(5);
      expect(formatted[4]).to.equal("... frames omitted ...");
    });

    it("should preserve all frames when frame count does not exceed maxFrames", () => {
      const formatted = formatFrames(makeFrames(25), Infinity);
      expect(formatted).to.have.length(25);
      expect(formatted[24]).to.equal("at com.example.App.fn24 (App.kt:25)");
    });
  });

  describe("toText", () => {
    const makeFrames = (count: number): Frame[] =>
      Array.from({ length: count }, (_, idx) => ({
        symbol: `com.example.App.fn${idx}`,
        file: "App.kt",
        line: idx + 1,
      }));

    const makeFatalEvent = (): Event => ({
      eventId: "evt_1",
      issue: { id: "iss_1", errorType: ErrorType.FATAL },
      threads: [
        { name: "main", crashed: true, frames: makeFrames(22) },
        { name: "worker-1", crashed: false, blamed: false, frames: makeFrames(3) },
      ],
      logs: Array.from({ length: 105 }, (_, i) => ({
        logTime: "2026-10-27T00:00:00Z",
        message: `log-${i}`,
      })),
      breadcrumbs: Array.from({ length: 12 }, (_, i) => ({
        eventTime: "2026-10-27T00:00:00Z",
        title: `crumb-${i}`,
        params: { step: `${i}` },
      })),
    });

    it("should only include crashed or blamed threads for FATAL events", () => {
      const text = toText(makeFatalEvent());
      expect(text.threads).to.include("Thread: main (crashed)");
      expect(text.threads).to.not.include("worker-1");
      expect(text.threads).to.include("... frames omitted ...");
    });

    it("should keep only the most recent 100 logs", () => {
      const text = toText(makeFatalEvent());
      expect(text.logs.split("\n")).to.have.length(100);
      expect(text.logs).to.include("log-104");
      expect(text.logs).to.not.include("log-0\n");
    });

    it("should keep only the most recent 10 breadcrumbs", () => {
      const text = toText(makeFatalEvent());
      expect(text.breadcrumbs.split("\n")).to.have.length(10);
      expect(text.breadcrumbs).to.include("crumb-11 { step: 11 }");
    });

    it("should include all threads, frames, logs, and breadcrumbs when full is true", () => {
      const text = toText(makeFatalEvent(), { full: true });
      expect(text.threads).to.include("Thread: worker-1");
      expect(text.threads).to.not.include("... frames omitted ...");
      expect(text.logs.split("\n")).to.have.length(105);
      expect(text.breadcrumbs.split("\n")).to.have.length(12);
    });
  });

  describe("batchGetEvents", () => {
    const eventNames = [
      "projects/1234567890/apps/1:1234567890:android:abcdef1234567890/events/test_event_id_1",
      "projects/1234567890/apps/1:1234567890:android:abcdef1234567890/events/test_event_id_2",
    ];

    it("should resolve with the response body on success", async () => {
      const mockResponse = {
        events: [{ id: "test_event_id_1" }, { id: "test_event_id_2" }],
      };

      nock(crashlyticsApiOrigin())
        .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/events:batchGet`)
        .query({
          names: eventNames,
        })
        .reply(200, mockResponse);

      const result = await batchGetEvents(appId, eventNames);

      expect(result).to.deep.equal(mockResponse);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if there are too many events", async () => {
      const tooManyEventNames = Array.from(Array(101).keys()).map(
        (i) =>
          `projects/1234567890/apps/1:1234567890:android:abcdef1234567890/events/test_event_id_${i}`,
      );
      await expect(batchGetEvents(appId, tooManyEventNames)).to.be.rejectedWith(
        FirebaseError,
        "Too many events in batchGet request",
      );
    });
  });
});
