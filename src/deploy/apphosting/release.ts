import { orchestrateRollout } from "../../apphosting/rollout";
import { logError } from "../../logError";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { logBullet, logSuccess, logWarning } from "../../utils";
import { Context } from "./args";

/**
 * Orchestrates rollouts for the backends targeted for deployment.
 */
export default async function (context: Context, options: Options): Promise<void> {
  const projectId = needProjectId(options);

  const rollouts = [];
  const rolloutIds = [];
  for (const backendId of context.backendConfigs.keys()) {
    const config = context.backendConfigs.get(backendId);
    const location = context.backendLocations.get(backendId);
    const storageUri = context.backendStorageUris.get(backendId);
    if (!config || !location || !storageUri) {
      logWarning(
        `Failed to find metadata for backend ${backendId}. Please contact support with the contents of your firebase-debug.log to report your issue.`,
      );
      continue;
    }
    rolloutIds.push(backendId);
    rollouts.push(
      orchestrateRollout({
        projectId,
        location,
        backendId,
        buildInput: {
          source: {
            archive: {
              userStorageUri: storageUri,
              rootDirectory: config.rootDir,
            },
          },
        },
      }),
    );
  }

  const multipleRolloutsMessage = `Starting new rollouts for backends ${Array.from(context.backendConfigs.keys()).join(", ")}`;
  const singleRolloutMessage = `Starting a new rollout for backend ${Array.from(context.backendConfigs.keys()).join(", ")}`;
  logBullet(
    `${rollouts.length > 1 ? multipleRolloutsMessage : singleRolloutMessage}; this may take a few minutes. It's safe to exit now.`,
  );
  const results = await Promise.allSettled(rollouts);
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status === "fulfilled") {
      logSuccess(`Rollout for backend ${rolloutIds[i]} complete`);
    } else {
      logWarning(`Rollout for backend ${rolloutIds[i]} failed.`);
      logError(res.reason);
    }
  }
}
