import * as ora from "ora";
import { consoleOrigin } from "../../api";
import { getBackend } from "../../apphosting/backend";
import { orchestrateRollout } from "../../apphosting/rollout";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import {
  logLabeledBullet,
  logLabeledError,
  logLabeledSuccess,
  logLabeledWarning,
} from "../../utils";
import { Context } from "./args";

/**
 * Orchestrates rollouts for the backends targeted for deployment.
 */
export default async function (context: Context, options: Options): Promise<void> {
  if (context.backendConfigs.size === 0) {
    return;
  }
  const projectId = needProjectId(options);
  const rollouts = [];
  const backendIds = [];
  for (const backendId of context.backendConfigs.keys()) {
    const config = context.backendConfigs.get(backendId);
    const location = context.backendLocations.get(backendId);
    const storageUri = context.backendStorageUris.get(backendId);
    if (!config || !location || !storageUri) {
      logLabeledWarning(
        "apphosting",
        `Failed to find metadata for backend ${backendId}. Please contact support with the contents of your firebase-debug.log to report your issue.`,
      );
      continue;
    }
    backendIds.push(backendId);
    let buildConfig;
    if (config.localBuild) {
      buildConfig = context.backendLocalBuilds[backendId].buildConfig;
    }
    rollouts.push(
      orchestrateRollout({
        projectId,
        location,
        backendId,
        buildInput: {
	  config: buildConfig,
          source: {
            archive: {
              userStorageUri: storageUri,
              rootDirectory: config.rootDir,
              locallyBuiltSource: config.localBuild,
            },
          },
        },
      }),
    );
  }

  logLabeledBullet(
    "apphosting",
    `You may also track the rollout(s) at:\n\t${consoleOrigin()}/project/${projectId}/apphosting`,
  );
  const rolloutsSpinner = ora(
    `Starting rollout(s) for backend(s) ${Array.from(context.backendConfigs.keys()).join(", ")}; this may take a few minutes. It's safe to exit now.\n`,
  ).start();
  const results = await Promise.allSettled(rollouts);
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status === "fulfilled") {
      const backend = await getBackend(projectId, backendIds[i]);
      logLabeledSuccess("apphosting", `Rollout for backend ${backendIds[i]} complete!`);
      logLabeledSuccess("apphosting", `Your backend is now deployed at:\n\thttps://${backend.uri}`);
    } else {
      logLabeledWarning("apphosting", `Rollout for backend ${backendIds[i]} failed.`);
      logLabeledError("apphosting", res.reason);
    }
  }
  rolloutsSpinner.stop();
}
