import { Client } from "../apiv2";
import * as prompt from "../prompt";
import * as api from "../api";
import { logger } from "../logger";
import * as utils from "../utils";
import { Options } from "../options";
import { configstore } from "../configstore";

const TIMEOUT_MILLIS = 30000;

const studioClient = new Client({
  urlPrefix: api.studioApiOrigin(),
  apiVersion: "v1",
});

/**
 * Reconciles the active project in your Studio Workspace when running the CLI
 * in Firebase Studio.
 * @param activeProjectFromConfig The project ID saved in configstore
 * @return A promise that resolves with the reconciled active project
 */
export async function reconcileStudioFirebaseProject(
  options: Options,
  activeProjectFromConfig: string | undefined,
): Promise<string | undefined> {
  const studioWorkspace = await getStudioWorkspace();
  // Fail gracefully and resolve with the existing configs
  if (!studioWorkspace) {
    return activeProjectFromConfig;
  }
  // If Studio has no project, update Studio if the CLI has one
  if (!studioWorkspace.firebaseProjectId) {
    if (activeProjectFromConfig) {
      await updateStudioFirebaseProject(activeProjectFromConfig);
    }
    return activeProjectFromConfig;
  }
  // If the CLI has no project, update the CLI with what Studio has
  if (!activeProjectFromConfig) {
    await writeStudioProjectToConfigStore(options, studioWorkspace.firebaseProjectId);
    return studioWorkspace.firebaseProjectId;
  }
  // If both have an active project, allow the user to choose
  if (studioWorkspace.firebaseProjectId !== activeProjectFromConfig && !options.nonInteractive) {
    const choices = [
      {
        name: `Set ${studioWorkspace.firebaseProjectId} from Firebase Studio as my active project in both places`,
        value: false as any,
      },
      {
        name: `Set ${activeProjectFromConfig} from Firebase CLI as my active project in both places`,
        value: true as any,
      },
    ];
    const useCliProject = await prompt.select({
      message:
        "Found different active Firebase Projects in the Firebase CLI and your Firebase Studio Workspace. Which project would you like to set as your active project?",
      choices,
    });
    if (useCliProject) {
      await updateStudioFirebaseProject(activeProjectFromConfig);
      return activeProjectFromConfig;
    } else {
      await writeStudioProjectToConfigStore(options, studioWorkspace.firebaseProjectId);
      return studioWorkspace.firebaseProjectId;
    }
  }
  // Otherwise, Studio and the CLI agree
  return studioWorkspace.firebaseProjectId;
}

export interface StudioWorkspace {
  name: string;
  firebaseProjectId: string | undefined;
}

async function getStudioWorkspace(): Promise<StudioWorkspace | undefined> {
  const workspaceId = process.env.WORKSPACE_SLUG;
  if (!workspaceId) {
    logger.error(
      `Failed to fetch Firebase Project from Studio Workspace because WORKSPACE_SLUG environment variable is empty`,
    );
    return undefined;
  }
  try {
    const res = await studioClient.request<void, StudioWorkspace>({
      method: "GET",
      path: `/workspaces/${workspaceId}`,
      timeout: TIMEOUT_MILLIS,
    });
    return res.body;
  } catch (err: any) {
    let message = err.message;
    if (err.original) {
      message += ` (original: ${err.original.message})`;
    }
    logger.error(`Failed to fetch Firebase Project from current Studio Workspace: ${message}`);
    // We're going to fail gracefully so that the caller can handle the error
    return undefined;
  }
}

async function writeStudioProjectToConfigStore(options: Options, studioProjectId: string) {
  if (options.projectRoot) {
    logger.info(
      `Updating Firebase CLI active project to match Studio Workspace '${studioProjectId}'`,
    );
    utils.makeActiveProject(options.projectRoot, studioProjectId);
    recordStudioProjectSyncTime();
  }
}

/**
 * Sets the active project for the current Firebase Studio Workspace
 * @param projectId The project ID saved in spanner
 * @return A promise that resolves when complete
 */
export async function updateStudioFirebaseProject(projectId: string): Promise<void> {
  logger.info(`Updating Studio Workspace active project to match Firebase CLI '${projectId}'`);
  const workspaceId = process.env.WORKSPACE_SLUG;
  if (!workspaceId) {
    logger.error(
      `Failed to update Firebase Project for Studio Workspace because WORKSPACE_SLUG environment variable is empty`,
    );
    return;
  }
  try {
    await studioClient.request({
      method: "PATCH",
      path: `/workspaces/${workspaceId}`,
      responseType: "json",
      body: {
        firebaseProjectId: projectId,
      },
      queryParams: {
        updateMask: "workspace.firebaseProjectId",
      },
      timeout: TIMEOUT_MILLIS,
    });
  } catch (err: any) {
    let message = err.message;
    if (err.original) {
      message += ` (original: ${err.original.message})`;
    }
    logger.debug(
      `Failed to update active Firebase Project for current Studio Workspace: ${message}`,
    );
  }
  recordStudioProjectSyncTime();
}

/**
 * Records the last time we synced the Studio project in Configstore.
 * This is important to trigger a file watcher in Firebase Studio that keeps the UI in sync.
 */
function recordStudioProjectSyncTime() {
  configstore.set("firebaseStudioProjectLastSynced", Date.now());
}
