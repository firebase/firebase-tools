import { Command } from "../command";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import * as clc from "colorette";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";
import { NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import * as rcRollout from "../remoteconfig/deleteRollout";
import { getRollout, parseRolloutIntoTable } from "../remoteconfig/getRollout";
import { FirebaseError } from "../error";
import { confirm } from "../prompt";

export const command = new Command("remoteconfig:rollouts:delete [rolloutId]")
  .description("delete a Remote Config rollout.")
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfigs.config.update"])
  .action(async (rolloutId: string, options: Options) => {
    if (!rolloutId) {
      throw new FirebaseError("Rollout ID must be provided.");
    }
    const projectNumber: string = await needProjectNumber(options);
    const rollout = await getRollout(projectNumber, NAMESPACE_FIREBASE, rolloutId);
    logger.info(parseRolloutIntoTable(rollout));
    await rcRollout.deleteRollout(projectNumber, NAMESPACE_FIREBASE, rolloutId);
    logger.info(clc.bold(`Successfully deleted rollout ${clc.yellow(rolloutId)}`));
    const confirmDeletion = await confirm({
      message: "Are you sure you want to delete this experiment? This cannot be undone.",
      default: false,
    });
    if (!confirmDeletion) {
      return;
    }
    logger.info(
      await rcRollout.deleteRollout(projectNumber, NAMESPACE_FIREBASE, rolloutId),
    );
  });
