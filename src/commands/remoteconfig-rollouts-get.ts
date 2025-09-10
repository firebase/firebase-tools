import { Command } from "../command";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { needProjectId } from "../projectUtils";
import { RemoteConfigRollout, NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import * as rcRollout from "../remoteconfig/rolloutget";
import { FirebaseError } from "../error";

export const command = new Command("remoteconfig:rollouts:get [rolloutId]")
  .description("get a Remote Config rollout")
  .before(requireAuth)
  // Using a general get permission. Adjust if a more specific one is available.
  .before(requirePermissions, ["firebaseremoteconfig.configs.get"])
  .action(async (rolloutId: string, options: Options) => {
    if (!rolloutId) {
      throw new FirebaseError("Rollout ID is required.");
    }
    const projectId: string = await needProjectId(options);
    const rollout: RemoteConfigRollout = await rcRollout.getRollout(
      projectId,
      NAMESPACE_FIREBASE,
      rolloutId,
    );
    logger.info(rcRollout.parseRolloutIntoTable(rollout));
    return rollout;
  });
