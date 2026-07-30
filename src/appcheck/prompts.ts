import { AppPlatform, listFirebaseApps, selectAppInteractively } from "../management/apps";
import { needProjectId } from "../projectUtils";
import { detectApps } from "../appUtils";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as clc from "colorette";
import { AppCheckDebugOptions } from "./types";

/**
 * Gets the appId from options or prompts the user to select an app if multiple exist.
 * Uses needProjectId(options) to retrieve the active or specified project ID.
 * @param options the command options
 * @param message the prompt shown when the user has to choose between apps.
 * Defaults to the wording used when registering a debug token.
 */
export async function getOrPromptAppId(
  options: AppCheckDebugOptions,
  message = "Select the app to register a debug token for:",
): Promise<{ projectId: string; appId: string }> {
  const projectId = needProjectId(options);

  logger.info(`Active Project: ${clc.bold(projectId)}`);

  if (options.app) {
    return { projectId, appId: options.app };
  }

  const projectDir = options.cwd || process.cwd();
  let apps = await listFirebaseApps(projectId, AppPlatform.ANY);
  if (!apps.length) {
    throw new FirebaseError(`There are no apps associated with project ${projectId}.`);
  }

  const localApps = await detectApps(projectDir);
  const localAppIds = localApps.map((a) => a.appId).filter(Boolean) as string[];
  if (localAppIds.length > 0) {
    const filteredApps = apps.filter((app) => localAppIds.includes(app.appId));
    if (filteredApps.length > 0) {
      apps = filteredApps;
    }
  }

  if (apps.length === 1) {
    return { projectId, appId: apps[0].appId };
  } else if (options.nonInteractive) {
    throw new FirebaseError(`Project ${projectId} has multiple apps, must specify an app id.`);
  }

  const selectedApp = await selectAppInteractively(apps, AppPlatform.ANY, {
    message,
  });

  return { projectId, appId: selectedApp.appId };
}

export const getOrPromptProjectAndAppId = getOrPromptAppId;
