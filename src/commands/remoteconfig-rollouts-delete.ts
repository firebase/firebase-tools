import { Command } from "../command";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";
import { NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import * as rcRollout from "../remoteconfig/deleteRollout";
import { getRollout, parseRolloutIntoTable } from "../remoteconfig/getRollout";
import { confirm } from "../prompt";

export const command = new Command("remoteconfig:rollouts:delete <rolloutId>")
  .description("delete a Remote Config rollout.")
  .before(requireAuth)
  .before(requirePermissions, [
    "cloud.configs.update",
    "firebaseanalytics.resources.googleAnalyticsEdit",
  ])
  .action(async (rolloutId: string, options: Options) => {
    const projectNumber: string = await needProjectNumber(options);
    const rollout = await getRollout(projectNumber, NAMESPACE_FIREBASE, rolloutId);
    logger.info(parseRolloutIntoTable(rollout));
    const confirmDeletion = await confirm({
      message: "Are you sure you want to delete this rollout? This cannot be undone.",
      default: false,
    });
    if (!confirmDeletion) {
      return;
    }
    logger.info(await rcRollout.deleteRollout(projectNumber, NAMESPACE_FIREBASE, rolloutId));
  });
