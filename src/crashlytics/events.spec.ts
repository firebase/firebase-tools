import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { listEvents, batchGetEvents } from "./events";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

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
