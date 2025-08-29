import { expect } from "chai";
import { remoteConfigApiOrigin } from "../api";
import * as nock from "nock";

import * as rcExperiment from "./getexperiment";
import { GetExperimentResult, NAMESPACE_FIREBASE } from "./interfaces";
import { FirebaseError } from "../error";

const PROJECT_ID = "1234567890";
const EXPERIMENT_ID_1 = "1";
const EXPERIMENT_ID_2 = "2";

// Test sample experiment
const expectedExperimentResult: GetExperimentResult = {
  name: "projects/1234567890/namespaces/firebase/experiments/1",
  definition: {
    displayName: "param_one",
    service: "EXPERIMENT_SERVICE_REMOTE_CONFIG",
    objectives: {
      activationEvent: {},
      eventObjectives: [
        {
          isPrimary: true,
          systemObjectiveDetails: {
            objective: "total_revenue",
          },
        },
        {
          systemObjectiveDetails: {
            objective: "retention_7",
          },
        },
        {
          customObjectiveDetails: {
            event: "app_exception",
            countType: "NO_EVENT_USERS",
          },
        },
      ],
    },
    variants: [
      {
        name: "Baseline",
        weight: 1,
      },
      {
        name: "Variant A",
        weight: 1,
      },
    ],
  },
  state: "PENDING",
  startTime: "1970-01-01T00:00:00Z",
  endTime: "1970-01-01T00:00:00Z",
  lastUpdateTime: "2025-07-25T08:24:30.682Z",
  etag: "e1",
};

describe("Remote Config Experiment", () => {
  describe.only("getExperiment", () => {
    afterEach(() => {
      expect(nock.isDone()).to.equal(true, "all nock stubs should have been called");
      nock.cleanAll();
    });

    it("should successfully retrieve a Remote Config experiment by ID", async () => {
      nock(remoteConfigApiOrigin())
        .get(`/v1/projects/${PROJECT_ID}/namespaces/firebase/experiments/${EXPERIMENT_ID_1}`)
        .reply(200, expectedExperimentResult);

      const experimentOne = await rcExperiment.getExperiment(
        PROJECT_ID,
        NAMESPACE_FIREBASE,
        EXPERIMENT_ID_1,
      );
      expect(experimentOne).to.deep.equal(expectedExperimentResult);
    });

    it("should reject with a FirebaseError if the API call fails", async () => {
      nock(remoteConfigApiOrigin())
        .get(`/v1/projects/${PROJECT_ID}/namespaces/firebase/experiments/${EXPERIMENT_ID_2}`)
        .reply(404, {});

      await expect(
        rcExperiment.getExperiment(PROJECT_ID, NAMESPACE_FIREBASE, EXPERIMENT_ID_2),
      ).to.eventually.be.rejectedWith(
        FirebaseError,
        `Failed to get Remote Config experiment with ID 2 for project 1234567890.`,
      );
    });
  });
});
