import { Options } from "../options";
import { AppMetadata, AppPlatform, listFirebaseApps } from "../management/apps";
import { getProjectId } from "../projectUtils";
import { getOrPromptProject } from "../management/projects";
import { detectApps } from "../appUtils";
import { select } from "../prompt";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as clc from "colorette";

export interface AppCheckDebugOptions extends Options {
  app?: string;
  displayName?: string;
}

/**
 *
 */
export async function getOrPromptProjectAndAppId(
  options: AppCheckDebugOptions,
): Promise<{ projectId: string; appId: string }> {
  let projectId = getProjectId(options);

  if (!projectId) {
    if (options.nonInteractive) {
      throw new FirebaseError("Must supply project id in non-interactive mode.");
    }
    const result = await getOrPromptProject(options);
    projectId = result.projectId;
    options.project = projectId;
  }
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

  const choices = apps.map((app: AppMetadata & { bundleId?: string; packageName?: string }) => {
    return {
      name:
        `${app.displayName || app.bundleId || app.packageName || "Unknown App"}` +
        ` - ${app.appId} (${app.platform})`,
      value: app,
    };
  });

  const selectedApp = await select<AppMetadata>({
    message: "Select the app to register a debug token for:",
    choices,
  });

  return { projectId, appId: selectedApp.appId };
}
