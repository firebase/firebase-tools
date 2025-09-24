import { expect } from "chai";
import * as nock from "nock";
import * as clc from "colorette";

import { remoteConfigApiOrigin } from "../api";
import { FirebaseError } from "../error";
import { deleteExperiment } from "./deleteexperiment";
import { NAMESPACE_FIREBASE } from "./interfaces";

const PROJECT_ID = "12345679";
const EXPERIMENT_ID = "1";

describe("Remote Config Experiment Delete", () => {
  afterEach(() => {
    expect(nock.isDone()).to.equal(true, "all nock stubs should have been called");
    nock.cleanAll();
  });

  it("should delete an experiment successfully", async () => {
    nock(remoteConfigApiOrigin())
      .delete(
        `/v1/projects/${PROJECT_ID}/namespaces/${NAMESPACE_FIREBASE}/experiments/${EXPERIMENT_ID}`,
      )
      .reply(200);

    await expect(
      deleteExperiment(PROJECT_ID, NAMESPACE_FIREBASE, EXPERIMENT_ID),
    ).to.eventually.equal(clc.bold(`Successfully deleted experiment ${clc.yellow(EXPERIMENT_ID)}`));
  });

  it("should throw FirebaseError if experiment is running", async () => {
    const errorMessage = `Experiment ${EXPERIMENT_ID} is currently running and cannot be deleted. If you want to delete this experiment, stop it at https://console.firebase.google.com/project/${PROJECT_ID}/config/experiment/results/${EXPERIMENT_ID}`;
    nock(remoteConfigApiOrigin())
      .delete(
        `/v1/projects/${PROJECT_ID}/namespaces/${NAMESPACE_FIREBASE}/experiments/${EXPERIMENT_ID}`,
      )
      .reply(400, {
        error: {
          message: errorMessage,
        },
      });

    await expect(
      deleteExperiment(PROJECT_ID, NAMESPACE_FIREBASE, EXPERIMENT_ID),
    ).to.be.rejectedWith(FirebaseError, errorMessage);
  });

  it("should throw FirebaseError if an internal error occurred", async () => {
    nock(remoteConfigApiOrigin())
      .delete(
        `/v1/projects/${PROJECT_ID}/namespaces/${NAMESPACE_FIREBASE}/experiments/${EXPERIMENT_ID}`,
      )
      .reply(500, {
        error: {
          message: "Internal server error",
        },
      });

    await expect(
      deleteExperiment(PROJECT_ID, NAMESPACE_FIREBASE, EXPERIMENT_ID),
    ).to.be.rejectedWith(
      FirebaseError,
      `Failed to delete Remote Config experiment with ID ${EXPERIMENT_ID} for project ${PROJECT_ID}. Error: Request to https://firebaseremoteconfig.googleapis.com/v1/projects/12345679/namespaces/firebase/experiments/1 had HTTP Error: 500, Internal server error`,
    );
  });
});
