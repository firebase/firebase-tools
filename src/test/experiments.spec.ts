import { expect } from "chai";
import {
  enableExperimentsFromCliEnvVariable,
  getSnapshotOfExperimentPreferences,
} from "../experiments";

describe("experiments", () => {
  describe("enableExperimentsFromCliEnvVariable", () => {
    it("should enable some experiments", () => {
      process.env.FIREBASE_CLI_EXPERIMENTS = "experiments,not_an_experiment";

      enableExperimentsFromCliEnvVariable();

      // Note: type-casting so that we can check on the not_an_experiment bit
      const localState = getSnapshotOfExperimentPreferences() as Record<string, boolean>;

      expect(localState.experiments).to.be.true;
      expect(localState.not_an_experiment).to.equal(undefined);
    });
  });
});
