import { expect } from "chai";
import * as nock from "nock";

import * as api from "../api";
import * as eventarc from "./eventarc";

const TRIGGER_NAME = "projects/test-project/locations/us-central1/triggers/firestore-handler";

const TEST_TRIGGER: eventarc.Trigger = {
  name: TRIGGER_NAME,
  eventFilters: [
    {
      attribute: "type",
      value: "google.cloud.firestore.document.v1.written",
    },
    {
      attribute: "database",
      value: "(default)",
    },
    {
      attribute: "document",
      value: "users/{userId}",
      operator: "match-path-pattern",
    },
  ],
  serviceAccount: "123456-compute@developer.gserviceaccount.com",
  destination: {
    cloudRun: {
      service: "firestore-handler",
      region: "us-central1",
    },
  },
  labels: {
    "deployment-tool": "cli-firebase",
  },
  eventDataContentType: "application/protobuf",
};

const TEST_OPERATION: eventarc.Operation = {
  name: "projects/test-project/locations/us-central1/operations/create-trigger",
  metadata: {
    createTime: "2026-07-27T09:00:00Z",
    target: TRIGGER_NAME,
    verb: "create",
    requestedCancellation: false,
    apiVersion: "v1",
  },
  done: false,
};

describe("eventarc", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe("getTrigger", () => {
    it("gets an existing trigger", async () => {
      nock(api.eventarcOrigin()).get(`/v1/${TRIGGER_NAME}`).reply(200, TEST_TRIGGER);

      await expect(eventarc.getTrigger(TRIGGER_NAME)).to.eventually.deep.equal(TEST_TRIGGER);
      expect(nock.isDone()).to.be.true;
    });

    it("returns undefined for a missing trigger", async () => {
      nock(api.eventarcOrigin()).get(`/v1/${TRIGGER_NAME}`).reply(404);

      await expect(eventarc.getTrigger(TRIGGER_NAME)).to.eventually.be.undefined;
      expect(nock.isDone()).to.be.true;
    });

    it("preserves non-404 HTTP errors", async () => {
      nock(api.eventarcOrigin())
        .get(`/v1/${TRIGGER_NAME}`)
        .reply(403, {
          error: { message: "permission denied" },
        });

      await expect(eventarc.getTrigger(TRIGGER_NAME)).to.be.rejectedWith(
        "Failed to get Eventarc trigger",
      );
      expect(nock.isDone()).to.be.true;
    });
  });

  it("creates a trigger", async () => {
    nock(api.eventarcOrigin())
      .post("/v1/projects/test-project/locations/us-central1/triggers", (body) => {
        expect(body).to.deep.equal(TEST_TRIGGER);
        return true;
      })
      .query({ triggerId: "firestore-handler" })
      .reply(200, TEST_OPERATION);

    await expect(eventarc.createTrigger(TEST_TRIGGER)).to.eventually.deep.equal(TEST_OPERATION);
    expect(nock.isDone()).to.be.true;
  });

  it("updates mutable trigger fields", async () => {
    nock(api.eventarcOrigin())
      .patch(`/v1/${TRIGGER_NAME}`, (body) => {
        expect(body).to.deep.equal(TEST_TRIGGER);
        return true;
      })
      .query({
        updateMask: "serviceAccount,destination,labels,eventDataContentType",
      })
      .reply(200, TEST_OPERATION);

    await expect(eventarc.updateTrigger(TEST_TRIGGER)).to.eventually.deep.equal(TEST_OPERATION);
    expect(nock.isDone()).to.be.true;
  });

  it("deletes a trigger", async () => {
    nock(api.eventarcOrigin()).delete(`/v1/${TRIGGER_NAME}`).reply(200, TEST_OPERATION);

    await expect(eventarc.deleteTrigger(TRIGGER_NAME)).to.eventually.deep.equal(TEST_OPERATION);
    expect(nock.isDone()).to.be.true;
  });

  describe("triggerMatches", () => {
    it("ignores event filter order and output-only fields", () => {
      const existing: eventarc.Trigger = {
        ...TEST_TRIGGER,
        eventFilters: [...TEST_TRIGGER.eventFilters].reverse(),
        destination: {
          cloudRun: {
            ...TEST_TRIGGER.destination.cloudRun,
            path: "/",
          },
        },
        uid: "server-assigned",
        state: "ACTIVE",
      };

      expect(eventarc.triggerMatches(existing, TEST_TRIGGER)).to.be.true;
    });

    it("detects immutable routing changes", () => {
      const existing: eventarc.Trigger = {
        ...TEST_TRIGGER,
        destination: {
          cloudRun: {
            ...TEST_TRIGGER.destination.cloudRun,
            service: "another-service",
          },
        },
      };

      expect(eventarc.triggerMatches(existing, TEST_TRIGGER)).to.be.false;
    });

    it("requires replacement only for immutable filters and channels", () => {
      expect(
        eventarc.triggerRequiresReplacement(
          {
            ...TEST_TRIGGER,
            labels: { runtime: "dart2" },
            serviceAccount: "another@test-project.iam.gserviceaccount.com",
          },
          TEST_TRIGGER,
        ),
      ).to.be.false;
      expect(
        eventarc.triggerRequiresReplacement(
          {
            ...TEST_TRIGGER,
            eventFilters: [{ attribute: "type", value: "another-event" }],
          },
          TEST_TRIGGER,
        ),
      ).to.be.true;
    });

    it("does not crash for a non-Cloud Run destination", () => {
      const existing = {
        ...TEST_TRIGGER,
        destination: { workflow: "projects/test/locations/test/workflows/test" },
      } as unknown as eventarc.Trigger;

      expect(eventarc.triggerMatches(existing, TEST_TRIGGER)).to.be.false;
    });

    it("detects channel removal and managed label changes", () => {
      expect(
        eventarc.triggerMatches(
          {
            ...TEST_TRIGGER,
            channel: "projects/test-project/locations/us-central1/channels/custom",
          },
          TEST_TRIGGER,
        ),
      ).to.be.false;
      expect(
        eventarc.triggerMatches(
          {
            ...TEST_TRIGGER,
            labels: { "deployment-tool": "another-tool" },
          },
          TEST_TRIGGER,
        ),
      ).to.be.false;
    });

    it("accepts Eventarc's default Google channel when no custom channel is requested", () => {
      expect(
        eventarc.triggerMatches(
          {
            ...TEST_TRIGGER,
            channel: "projects/test-project/locations/us-central1/channels/googleChannel",
          },
          TEST_TRIGGER,
        ),
      ).to.be.true;
    });
  });

  it("strips output-only fields before recreating a trigger", () => {
    expect(
      eventarc.triggerForCreate({
        ...TEST_TRIGGER,
        uid: "server-assigned",
        state: "ACTIVE",
        createTime: "2026-07-27T09:00:00Z",
      }),
    ).to.deep.equal(TEST_TRIGGER);
  });
});
