import { Command } from "../command";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import * as clc from "colorette";

import { FirebaseError } from "../error";
import { logger } from "../logger";

import { needProjectNumber } from "../projectUtils";
import { NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import * as rcExperiment from "../remoteconfig/deleteexperiment";

export const command = new Command("remoteconfig:experiments:delete [experimentId]")
  .description("delete a Remote Config experiment")
  .before(requireAuth)
  .before(requirePermissions, ["firebaseabt.experiments.delete"])
  .action(async (experimentId: string, options: Options) => {
    if (isNaN(parseInt(experimentId))) {
      throw new FirebaseError("Experiment ID must be a number.");
    }
    const projectNumber: string = await needProjectNumber(options);
    await rcExperiment.deleteExperiment(
      projectNumber,
      NAMESPACE_FIREBASE,
      experimentId,
    );
    logger.info(clc.bold(`Successfully deleted experiment ${clc.yellow(experimentId)}`));
  });
