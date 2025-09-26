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
  let backendIds = Object.keys(context.backendConfigs);

  const missingBackends = backendIds.filter(
    (id) => !context.backendLocations[id] || !context.backendStorageUris[id],
  );
  if (missingBackends.length > 0) {
    logLabeledWarning(
      "apphosting",
      `Failed to find metadata for backend(s) ${backendIds.join(", ")}. Please contact support with the contents of your firebase-debug.log to report your issue.`,
    );
    backendIds = backendIds.filter((id) => !missingBackends.includes(id));
  }

  const localBuildBackends = backendIds.filter((id) => context.backendLocalBuilds[id]);
  if (localBuildBackends.length > 0) {
    logLabeledWarning(
      "apphosting",
      `Skipping backend(s) ${localBuildBackends.join(", ")}. Local Builds are not supported yet.`,
    );
    backendIds = backendIds.filter((id) => !localBuildBackends.includes(id));
  }

  if (backendIds.length === 0) {
    return;
  }

  const projectId = needProjectId(options);
  const rollouts = backendIds.map((backendId) =>
    // TODO(9114): Add run_command
    // TODO(914): Set the buildConfig.
    // TODO(914): Set locallyBuiltSource.
    orchestrateRollout({
      projectId,
      backendId,
      location: context.backendLocations[backendId],
      buildInput: {
        source: {
          archive: {
            userStorageUri: context.backendStorageUris[backendId],
            rootDirectory: context.backendConfigs[backendId].rootDir,
          },
        },
      },
    }),
  );

  logLabeledBullet(
    "apphosting",
    `You may also track the rollout(s) at:\n\t${consoleOrigin()}/project/${projectId}/apphosting`,
  );
  const rolloutsSpinner = ora(
    `Starting rollout(s) for backend(s) ${backendIds.join(", ")}; this may take a few minutes. It's safe to exit now.\n`,
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
