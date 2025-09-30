import { Command } from "../command";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";
import { NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import * as rcExperiment from "../remoteconfig/deleteExperiment";
import { getExperiment, parseExperiment } from "../remoteconfig/getExperiment";
import { confirm } from "../prompt";

export const command = new Command("remoteconfig:experiments:delete [experimentId]")
  .description("delete a Remote Config experiment.")
  .before(requireAuth)
  .before(requirePermissions, [
    "firebaseabt.experiments.delete",
    "firebaseanalytics.resources.googleAnalyticsEdit",
  ])
  .action(async (experimentId: string, options: Options) => {
    const projectNumber: string = await needProjectNumber(options);
    const experiment = await getExperiment(projectNumber, NAMESPACE_FIREBASE, experimentId);
    logger.info(parseExperiment(experiment));
    const confirmDeletion = await confirm({
      message: "Are you sure you want to delete this experiment? This cannot be undone.",
      default: false,
    });
    if (!confirmDeletion) {
      return;
    }
    logger.info(
      await rcExperiment.deleteExperiment(projectNumber, NAMESPACE_FIREBASE, experimentId),
    );
  });
