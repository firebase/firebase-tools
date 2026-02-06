import * as clc from "colorette";
import { existsSync } from "fs";
import * as ora from "ora";
import * as path from "path";
import { Setup } from "..";
import { webApps } from "../../apphosting/app";
import {
  createBackend,
  ensureAppHostingComputeServiceAccount,
  ensureRequiredApisEnabled,
  promptExistingBackend,
  promptLocation,
  promptNewBackendId,
} from "../../apphosting/backend";
import { Config } from "../../config";
import { FirebaseError } from "../../error";
import { AppHostingSingle } from "../../firebaseConfig";
import { ensureApiEnabled } from "../../gcp/apphosting";
import { isBillingEnabled } from "../../gcp/cloudbilling";
import { input, select } from "../../prompt";
import { readTemplateSync } from "../../templates";
import * as utils from "../../utils";
import { logBullet } from "../../utils";

const APPHOSTING_YAML_TEMPLATE = readTemplateSync("init/apphosting/apphosting.yaml");

/**
 * Set up an apphosting.yaml file for a new App Hosting project.
 */
export async function doSetup(setup: Setup, config: Config): Promise<void> {
  const projectId = setup.projectId as string;
  if (!(await isBillingEnabled(setup))) {
    throw new FirebaseError(
      `Firebase App Hosting requires billing to be enabled on your project. To upgrade, visit the following URL: https://console.firebase.google.com/project/${projectId}/usage/details`,
    );
  }
  await ensureApiEnabled({ projectId });
  await ensureRequiredApisEnabled(projectId);
  // N.B. Deploying a backend from source requires the App Hosting compute service
  // account to have the storage.objectViewer IAM role.
  //
  // We don't want to update the IAM permissions right before attempting to deploy,
  // since IAM propagation delay will likely cause the first one to fail. However,
  // `firebase init apphosting` is a prerequisite to the `firebase deploy` command,
  // so we check and add the role here to give the IAM changes time to propagate.
  await ensureAppHostingComputeServiceAccount(projectId, /* serviceAccount= */ "");

  utils.logBullet(
    "This command links your local project to Firebase App Hosting. You will be able to deploy your web app with `firebase deploy` after setup.",
  );
  const backendConfig: AppHostingSingle = {
    backendId: "",
    rootDir: "",
    ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", "functions"],
  };
  const createOrLink: string = await select({
    default: "Create a new backend",
    message: "Please select an option",
    choices: [
      { name: "Create a new backend", value: "create" },
      { name: "Link to an existing backend", value: "link" },
    ],
  });
  if (createOrLink === "link") {
    backendConfig.backendId = await promptExistingBackend(
      projectId,
      "Which backend would you like to link?",
    );
  } else {
    logBullet(`${clc.yellow("===")} Set up your backend`);
    const location = await promptLocation(
      projectId,
      "Select a primary region to host your backend:\n",
    );
    const backendId = await promptNewBackendId(projectId, location);
    utils.logSuccess(`Name set to ${backendId}\n`);
    backendConfig.backendId = backendId;

    const webApp = await webApps.getOrCreateWebApp(
      projectId,
      /* firebaseWebAppId= */ null,
      backendId,
    );
    if (!webApp) {
      utils.logWarning(`Firebase web app not set`);
    }

    const createBackendSpinner = ora("Creating your new backend...").start();
    const backend = await createBackend(
      projectId,
      location,
      backendId,
      /* serviceAccount= */ null,
      /* repository= */ undefined,
      webApp?.id,
    );
    createBackendSpinner.succeed(`Successfully created backend!\n\t${backend.name}\n`);
  }

  logBullet(`${clc.yellow("===")} Deploy local source setup`);
  backendConfig.rootDir = await input({
    default: "/",
    message: "Specify your app's root directory relative to your firebase.json directory",
  });

  upsertAppHostingConfig(backendConfig, config);
  config.writeProjectFile("firebase.json", config.src);

  utils.logBullet("Writing default settings to " + clc.bold("apphosting.yaml") + "...");
  const absRootDir = path.join(process.cwd(), backendConfig.rootDir);
  if (!existsSync(absRootDir)) {
    throw new FirebaseError(
      `Failed to write apphosting.yaml file because app root directory ${absRootDir} does not exist. Please try again with a valid directory.`,
    );
  }
  await config.askWriteProjectFile(
    path.join(absRootDir, "apphosting.yaml"),
    APPHOSTING_YAML_TEMPLATE,
  );

  utils.logSuccess("Firebase initialization complete!");
}

/** Exported for unit testing. */
export function upsertAppHostingConfig(backendConfig: AppHostingSingle, config: Config): void {
  if (!config.src.apphosting) {
    config.set("apphosting", backendConfig);
    return;
  }
  if (Array.isArray(config.src.apphosting)) {
    config.set("apphosting", [...config.src.apphosting, backendConfig]);
    return;
  }
  config.set("apphosting", [config.src.apphosting, backendConfig]);
}
