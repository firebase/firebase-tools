import { Command } from "../command";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import * as clc from "colorette";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";
import { NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import * as rcRollout from "../remoteconfig/rolloutdelete";
import { FirebaseError } from "../error";

export const command = new Command("remoteconfig:rollouts:delete [rolloutId]")
  .description("delete a Remote Config rollout")
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfigs.config.update"])
  .action(async (rolloutId: string, options: Options) => {
    if (!rolloutId) {
      throw new FirebaseError("Rollout ID must be provided.");
    }
    const projectId: string = await needProjectNumber(options);
    await rcRollout.deleteRollout(projectId, NAMESPACE_FIREBASE, rolloutId);
    logger.info(clc.bold(`Successfully deleted rollout ${clc.yellow(rolloutId)}`));
  });
