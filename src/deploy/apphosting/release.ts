import * as ora from "ora";
import { getBackend } from "../../apphosting/backend";
import { orchestrateRollout } from "../../apphosting/rollout";
import { logError } from "../../logError";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { logSuccess, logWarning } from "../../utils";
import { Context } from "./args";

/**
 * Orchestrates rollouts for the backends targeted for deployment.
 */
export default async function (context: Context, options: Options): Promise<void> {
  const projectId = needProjectId(options);

  const rollouts = [];
  const backendIds = [];
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
    backendIds.push(backendId);
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

  const rolloutsSpinner = ora(
    `Starting rollout(s) for backend(s) ${Array.from(context.backendConfigs.keys()).join(", ")}; this may take a few minutes. It's safe to exit now.`,
  ).start();
  const results = await Promise.allSettled(rollouts);
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status === "fulfilled") {
      const backend = await getBackend(projectId, backendIds[i]);
      logSuccess(`Rollout for backend ${backendIds[i]} complete!`);
      logSuccess(`Your backend is now deployed at:\n\thttps://${backend.uri}`);
    } else {
      logWarning(`Rollout for backend ${backendIds[i]} failed.`);
      logError(res.reason);
    }
  }
  rolloutsSpinner.stop();
}
