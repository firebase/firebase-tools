import { expect } from "chai";
import * as nock from "nock";
import { remoteConfigApiOrigin } from "../api";
import { FirebaseError } from "../error";
import { NAMESPACE_FIREBASE } from "./interfaces";
import * as clc from "colorette";
import { deleteRollout } from "./rolloutdelete";

const PROJECT_ID = "12345679";
const ROLLOUT_ID = "rollout_1";

describe("Remote Config Rollout Delete", () => {
  afterEach(() => {
    expect(nock.isDone()).to.equal(true, "all nock stubs should have been called");
    nock.cleanAll();
  });

  it("should delete an rollout successfully", async () => {
    nock(remoteConfigApiOrigin())
      .delete(`/v1/projects/${PROJECT_ID}/namespaces/${NAMESPACE_FIREBASE}/rollouts/${ROLLOUT_ID}`)
      .reply(200);

    await expect(deleteRollout(PROJECT_ID, NAMESPACE_FIREBASE, ROLLOUT_ID)).to.eventually.equal(
      clc.bold(`Successfully deleted rollout ${clc.yellow(ROLLOUT_ID)}`),
    );
  });

  it("should throw FirebaseError if an internal error occurred", async () => {
    nock(remoteConfigApiOrigin())
      .delete(`/v1/projects/${PROJECT_ID}/namespaces/${NAMESPACE_FIREBASE}/rollouts/${ROLLOUT_ID}`)
      .reply(500, {
        error: {
          message: "Internal server error",
        },
      });

    const expectedErrorMessage = `Failed to delete Remote Config rollout '${ROLLOUT_ID}'. Cause: Request to https://firebaseremoteconfig.googleapis.com/v1/projects/12345679/namespaces/firebase/rollouts/${ROLLOUT_ID} had HTTP Error: 500, Internal server error`;

    await expect(deleteRollout(PROJECT_ID, NAMESPACE_FIREBASE, ROLLOUT_ID)).to.be.rejectedWith(
      FirebaseError,
      expectedErrorMessage,
    );
  });
});
