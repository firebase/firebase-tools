import { select } from "../../../prompt";
import { Setup } from "../..";
import { FirebaseError } from "../../../error";
import { AppInfo, getConfigFileName, parseAppId } from "./utils";
import { listFirebaseApps, AppMetadata, AppPlatform } from "../../../management/apps";
import { provisionFirebaseApp } from "../../../management/provisioning/provision";
import {
  ProvisionAppOptions,
  ProvisionFirebaseAppOptions,
} from "../../../management/provisioning/types";

export interface AiLogicInfo {
  appId: string;
  displayName?: string;
}

function checkForApps(apps: AppMetadata[]): void {
  if (!apps.length) {
    throw new FirebaseError(
      "No Firebase apps found in this project. Please create an app first using the Firebase Console or 'firebase apps:create'.",
      { exit: 1 },
    );
  }
}

async function selectAppInteractively(apps: AppMetadata[]): Promise<AppMetadata> {
  checkForApps(apps);

  const choices = apps.map((app) => {
    let displayText = app.displayName || app.appId;

    if (!app.displayName) {
      if (app.platform === AppPlatform.IOS && "bundleId" in app) {
        displayText = app.bundleId as string;
      } else if (app.platform === AppPlatform.ANDROID && "packageName" in app) {
        displayText = app.packageName as string;
      }
    }

    return {
      name: `${displayText} - ${app.appId} (${app.platform})`,
      value: app,
    };
  });

  return await select<AppMetadata>({
    message: "Select the Firebase app to enable AI Logic for:",
    choices,
  });
}

/**
 * Ask questions for AI Logic setup via CLI
 */
export async function askQuestions(setup: Setup): Promise<void> {
  if (!setup.projectId) {
    throw new FirebaseError(
      "No project ID found. Please ensure you are in a Firebase project directory or specify a project.",
      { exit: 1 },
    );
  }

  const apps = await listFirebaseApps(setup.projectId, AppPlatform.ANY);
  const selectedApp = await selectAppInteractively(apps);

  // Set up the feature info
  if (!setup.featureInfo) {
    setup.featureInfo = {};
  }

  setup.featureInfo.ailogic = {
    appId: selectedApp.appId,
    displayName: selectedApp.displayName,
  };
}

function getAppOptions(appInfo: AppInfo, displayName?: string): ProvisionAppOptions {
  switch (appInfo.platform) {
    case AppPlatform.IOS:
      return {
        platform: AppPlatform.IOS,
        appId: appInfo.appId,
        displayName,
      };
    case AppPlatform.ANDROID:
      return {
        platform: AppPlatform.ANDROID,
        appId: appInfo.appId,
        displayName,
      };
    case AppPlatform.WEB:
      return {
        platform: AppPlatform.WEB,
        appId: appInfo.appId,
        displayName,
      };
    default:
      throw new FirebaseError(`Unsupported platform ${appInfo.platform}`, { exit: 1 });
  }
}

/**
 * AI Logic provisioning: enables AI Logic via API (assumes app and project are already validated)
 */
export async function actuate(setup: Setup): Promise<void> {
  const ailogicInfo = setup.featureInfo?.ailogic as AiLogicInfo;
  if (!ailogicInfo) {
    return;
  }

  try {
    const appInfo = parseAppId(ailogicInfo.appId);
    if (!setup.projectId) {
      throw new FirebaseError(
        "No project ID found. Please ensure you are in a Firebase project directory or specify a project.",
        { exit: 1 },
      );
    }

    // Build provision options and call API directly
    const provisionOptions: ProvisionFirebaseAppOptions = {
      project: {
        parent: { type: "existing_project", projectId: setup.projectId },
      },
      app: getAppOptions(appInfo, ailogicInfo.displayName),
      features: {
        firebaseAiLogicInput: {},
      },
    };

    const response = await provisionFirebaseApp(provisionOptions);

    const configFileName = getConfigFileName(appInfo.platform);
    const configContent = Buffer.from(response.configData, "base64").toString("utf8");

    setup.instructions.push(
      `Firebase AI Logic has been enabled for existing ${appInfo.platform} app: ${ailogicInfo.appId}`,
      `Save the following content as ${configFileName} in your app's root directory:`,
      "",
      configContent,
      "",
      "Place this config file in the appropriate location for your platform.",
    );
  } catch (error) {
    if (error instanceof FirebaseError) {
      throw new FirebaseError(`AI Logic setup failed: ${error.message}`, {
        original: error.original || error,
        exit: error.exit,
      });
    }
    throw new FirebaseError(
      `AI Logic setup failed: ${error instanceof Error ? error.message : String(error)}`,
      { original: error instanceof Error ? error : new Error(String(error)), exit: 2 },
    );
  }
}
