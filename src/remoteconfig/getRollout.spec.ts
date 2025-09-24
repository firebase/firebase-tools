import { expect } from "chai";
import { remoteConfigApiOrigin } from "../api";
import * as nock from "nock";
import * as Table from "cli-table3";
import * as util from "util";

import * as rcRollout from "./getRollout";
import { RemoteConfigRollout, NAMESPACE_FIREBASE } from "./interfaces";
import { FirebaseError } from "../error";

const PROJECT_ID = "1234567890";
const ROLLOUT_ID_1 = "rollout_1";
const ROLLOUT_ID_2 = "rollout_2";

const expectedRollout: RemoteConfigRollout = {
  name: `projects/${PROJECT_ID}/namespaces/firebase/rollouts/${ROLLOUT_ID_1}`,
  definition: {
    displayName: "Rollout demo",
    description: "rollouts are fun!",
    service: "ROLLOUT_SERVICE_REMOTE_CONFIG",
    controlVariant: {
      name: "Control",
      weight: 1,
    },
    enabledVariant: {
      name: "Enabled",
      weight: 1,
    },
  },
  state: "DONE",
  startTime: "2025-01-01T00:00:00Z",
  endTime: "2025-01-31T23:59:59Z",
  createTime: "2025-01-01T00:00:00Z",
  lastUpdateTime: "2025-01-01T00:00:00Z",
  etag: "e1",
};

describe("Remote Config Rollout Get", () => {
  describe("getRollout", () => {
    afterEach(() => {
      expect(nock.isDone()).to.equal(true, "all nock stubs should have been called");
      nock.cleanAll();
    });

    it("should successfully retrieve a Remote Config rollout by ID", async () => {
      nock(remoteConfigApiOrigin())
        .get(`/v1/projects/${PROJECT_ID}/namespaces/firebase/rollouts/${ROLLOUT_ID_1}`)
        .reply(200, expectedRollout);

      const rolloutOne = await rcRollout.getRollout(PROJECT_ID, NAMESPACE_FIREBASE, ROLLOUT_ID_1);

      expect(rolloutOne).to.deep.equal(expectedRollout);
    });

    it("should reject with a FirebaseError if the API call fails", async () => {
      nock(remoteConfigApiOrigin())
        .get(`/v1/projects/${PROJECT_ID}/namespaces/firebase/rollouts/${ROLLOUT_ID_2}`)
        .reply(404, {});
      const expectedError = `Failed to get Remote Config Rollout with ID ${ROLLOUT_ID_2} for project ${PROJECT_ID}.`;

      await expect(
        rcRollout.getRollout(PROJECT_ID, NAMESPACE_FIREBASE, ROLLOUT_ID_2),
      ).to.eventually.be.rejectedWith(FirebaseError, expectedError);
    });
  });
  describe("parseRollout", () => {
    it("should correctly parse and format an rollout result into a tabular format", () => {
      const resultTable = rcRollout.parseRolloutIntoTable(expectedRollout);
      const expectedTable = [
        ["Name", expectedRollout.name],
        ["Display Name", expectedRollout.definition.displayName],
        ["Description", expectedRollout.definition.description],
        ["State", expectedRollout.state],
        ["Create Time", expectedRollout.createTime],
        ["Start Time", expectedRollout.startTime],
        ["End Time", expectedRollout.endTime],
        ["Last Update Time", expectedRollout.lastUpdateTime],
        [
          "Control Variant",
          util.inspect(expectedRollout.definition.controlVariant, {
            showHidden: false,
            depth: null,
          }),
        ],
        [
          "Enabled Variant",
          util.inspect(expectedRollout.definition.enabledVariant, {
            showHidden: false,
            depth: null,
          }),
        ],
        ["ETag", expectedRollout.etag],
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
