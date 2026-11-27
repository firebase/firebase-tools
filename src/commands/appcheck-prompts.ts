import {
  AppPlatform,
  AppMetadata,
  listFirebaseApps,
  selectAppInteractively,
} from "../management/apps";
import { needProjectId } from "../projectUtils";
import { detectApps } from "../appUtils";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as clc from "colorette";
import { AppCheckDebugOptions } from "../appcheck/types";

/**
 * Narrows a project's apps down to one, by prompting when there is a choice.
 *
 * Apps registered in the directory the user is standing in come first, since
 * those are the ones they are most likely to mean.
 */
async function chooseApp(
  projectId: string,
  apps: AppMetadata[],
  options: AppCheckDebugOptions,
  message: string,
): Promise<AppMetadata> {
  const localApps = await detectApps(options.cwd || process.cwd());
  const localAppIds = localApps.map((a) => a.appId).filter(Boolean) as string[];
  const local = localAppIds.length ? apps.filter((app) => localAppIds.includes(app.appId)) : [];
  const choices = local.length ? local : apps;

  if (choices.length === 1) {
    return choices[0];
  }
  if (options.nonInteractive) {
    throw new FirebaseError(`Project ${projectId} has multiple apps, must specify an app id.`);
  }
  return selectAppInteractively(choices, AppPlatform.ANY, { message });
}

/** Lists a project's apps, failing with a clear message when it has none. */
async function listAppsOrThrow(projectId: string): Promise<AppMetadata[]> {
  const apps = await listFirebaseApps(projectId, AppPlatform.ANY);
  if (!apps.length) {
    throw new FirebaseError(`There are no apps associated with project ${projectId}.`);
  }
  return apps;
}

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

  const app = await chooseApp(projectId, await listAppsOrThrow(projectId), options, message);
  return { projectId, appId: app.appId };
}

export const getOrPromptProjectAndAppId = getOrPromptAppId;

/**
 * Like `getOrPromptAppId`, but also returns the app's platform, and validates
 * `--app` against the project instead of trusting it.
 *
 * Which App Check providers apply depends on the platform, so the provider
 * commands need it. Resolving the app and its platform in one pass keeps this
 * to a single apps listing per command.
 */
export async function getOrPromptApp(
  options: AppCheckDebugOptions,
  message: string,
): Promise<{ projectId: string; appId: string; platform: string }> {
  const projectId = needProjectId(options);

  logger.info(`Active Project: ${clc.bold(projectId)}`);

  const apps = await listAppsOrThrow(projectId);

  if (options.app) {
    const app = apps.find((a) => a.appId === options.app);
    if (!app) {
      throw new FirebaseError(`App ${options.app} was not found in project ${projectId}.`);
    }
    return { projectId, appId: app.appId, platform: app.platform };
  }

  const app = await chooseApp(projectId, apps, options, message);
  return { projectId, appId: app.appId, platform: app.platform };
}
