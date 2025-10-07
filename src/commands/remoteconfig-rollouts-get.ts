import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";
import { RemoteConfigRollout, NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import * as rcRollout from "../remoteconfig/getRollout";
import { RemoteConfigOptions } from "../remoteconfig/options";

export const command = new Command("remoteconfig:rollouts:get <rolloutId>")
  .description("get a Remote Config rollout")
  .before(requireAuth)
  .before(requirePermissions, ["cloud.configs.get"])
  .action(async (rolloutId: string, options: RemoteConfigOptions) => {
    const projectNumber: string = await needProjectNumber(options);
    const rollout: RemoteConfigRollout = await rcRollout.getRollout(
      projectNumber,
      NAMESPACE_FIREBASE,
      rolloutId,
    );
    logger.info(rcRollout.parseRolloutIntoTable(rollout));
    return rollout;
  });
