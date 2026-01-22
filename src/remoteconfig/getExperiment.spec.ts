import { expect } from "chai";
import { remoteConfigApiOrigin } from "../api";
import * as nock from "nock";
import * as Table from "cli-table3";
import * as util from "util";

import * as rcExperiment from "./getExperiment";
import { GetExperimentResult, NAMESPACE_FIREBASE } from "./interfaces";
import { FirebaseError } from "../error";

const PROJECT_ID = "1234567890";
const EXPERIMENT_ID_1 = "1";
const EXPERIMENT_ID_2 = "2";

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

describe("Remote Config Experiment Get", () => {
  describe("getExperiment", () => {
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

  describe("parseExperiment", () => {
    it("should correctly parse and format an experiment result into a tabular format", () => {
      const resultTable = rcExperiment.parseExperiment(expectedExperimentResult);
      const expectedTable = [
        ["Name", expectedExperimentResult.name],
        ["Display Name", expectedExperimentResult.definition.displayName],
        ["Service", expectedExperimentResult.definition.service],
        [
          "Objectives",
          util.inspect(expectedExperimentResult.definition.objectives, {
            showHidden: false,
            depth: null,
          }),
        ],
        [
          "Variants",
          util.inspect(expectedExperimentResult.definition.variants, {
            showHidden: false,
            depth: null,
          }),
        ],
        ["State", expectedExperimentResult.state],
        ["Start Time", expectedExperimentResult.startTime],
        ["End Time", expectedExperimentResult.endTime],
        ["Last Update Time", expectedExperimentResult.lastUpdateTime],
        ["etag", expectedExperimentResult.etag],
      ];

      const expectedTableString = new Table({
        head: ["Entry Name", "Value"],
        style: { head: ["green"] },
      });

      expectedTableString.push(...expectedTable);
      expect(resultTable).to.equal(expectedTableString.toString());
    });
  });
});
