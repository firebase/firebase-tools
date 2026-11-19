import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";
import { NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import * as rcRollout from "../remoteconfig/deleteRollout";
import { getRollout, parseRolloutIntoTable } from "../remoteconfig/getRollout";
import { confirm } from "../prompt";
import { FirebaseError } from "../error";
import { RemoteConfigOptions } from "../remoteconfig/options";

export const command = new Command("remoteconfig:rollouts:delete <rolloutId>")
  .description(
    "delete a Remote Config rollout after a confirmation prompt (use --force to skip the prompt).",
  )
  .withForce("delete without prompting for confirmation (required with --non-interactive)")
  .before(requireAuth)
  .before(requirePermissions, [
    "cloud.configs.update",
    "firebaseanalytics.resources.googleAnalyticsEdit",
  ])
  .action(async (rolloutId: string, options: RemoteConfigOptions) => {
    const projectNumber: string = await needProjectNumber(options);
    const rollout = await getRollout(projectNumber, NAMESPACE_FIREBASE, rolloutId);
    logger.info(parseRolloutIntoTable(rollout));
    if (options.nonInteractive && !options.force) {
      throw new FirebaseError(
        `Refusing to delete rollout ${rolloutId} without confirmation in non-interactive mode. Re-run with --force to delete it.`,
      );
    }
    const confirmDeletion = await confirm({
      message: "Are you sure you want to delete this rollout? This cannot be undone.",
      default: false,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    if (!confirmDeletion) {
      return;
    }
    logger.info(await rcRollout.deleteRollout(projectNumber, NAMESPACE_FIREBASE, rolloutId));
  });
