import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";
import { NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import * as rcExperiment from "../remoteconfig/deleteExperiment";
import { getExperiment, parseExperiment } from "../remoteconfig/getExperiment";
import { confirm } from "../prompt";
import { FirebaseError } from "../error";
import { RemoteConfigOptions } from "../remoteconfig/options"; // 👈 Import the new interface

export const command = new Command("remoteconfig:experiments:delete <experimentId>")
  .description(
    "delete a Remote Config experiment after a confirmation prompt (use --force to skip the prompt).",
  )
  .withForce("delete without prompting for confirmation (required with --non-interactive)")
  .before(requireAuth)
  .before(requirePermissions, [
    "firebaseabt.experiments.delete",
    "firebaseanalytics.resources.googleAnalyticsEdit",
  ])
  .action(async (experimentId: string, options: RemoteConfigOptions) => {
    const projectNumber: string = await needProjectNumber(options);
    const experiment = await getExperiment(projectNumber, NAMESPACE_FIREBASE, experimentId);
    logger.info(parseExperiment(experiment));
    if (options.nonInteractive && !options.force) {
      throw new FirebaseError(
        `Refusing to delete experiment ${experimentId} without confirmation in non-interactive mode. Re-run with --force to delete it.`,
      );
    }
    const confirmDeletion = await confirm({
      message: "Are you sure you want to delete this experiment? This cannot be undone.",
      default: false,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    if (!confirmDeletion) {
      return;
    }
    logger.info(
      await rcExperiment.deleteExperiment(projectNumber, NAMESPACE_FIREBASE, experimentId),
    );
  });
