import { Command } from "../command";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";
import { GetExperimentResult, NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import * as rcExperiment from "../remoteconfig/getexperiment";
import { FirebaseError } from "../error";

export const command = new Command("remoteconfig:experiments:get [experimentId]")
  .description("retrieve a Remote Config experiment")
  .before(requireAuth)
  .before(requirePermissions, ["firebaseabt.experiments.get"])
  .action(async (experimentId: string, options: Options) => {
    if (isNaN(parseInt(experimentId))) {
      throw new FirebaseError("Experiment ID must be a number.");
    }
    const projectNumber: string = await needProjectNumber(options);
    const experiment: GetExperimentResult = await rcExperiment.getExperiment(
      projectNumber,
      NAMESPACE_FIREBASE,
      experimentId,
    );
    logger.info(rcExperiment.parseExperiment(experiment));
    return experiment;
  });
