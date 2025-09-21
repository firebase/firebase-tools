import { Command } from "../command";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";
import { RemoteConfigRollout, NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import * as rcRollout from "../remoteconfig/rolloutget";
import { FirebaseError } from "../error";

export const command = new Command("remoteconfig:rollouts:get [rolloutId]")
    .description("get a Remote Config rollout")
    .before(requireAuth)
    .before(requirePermissions, ["cloud.configs.get"])
    .action(async (rolloutId: string, options: Options) => {
        console.log("[VERIFY] ---------- local script is linked ----------- ");
        if (!rolloutId) {
            throw new FirebaseError("Rollout ID is required.");
        }
        const projectId: string = await needProjectNumber(options);
        const rollout: RemoteConfigRollout = await rcRollout.getRollout(
            projectId,
            NAMESPACE_FIREBASE,
            rolloutId,
        );
        logger.info(rcRollout.parseRolloutIntoTable(rollout));
        return rollout;
    });
