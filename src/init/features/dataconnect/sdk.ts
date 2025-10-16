import * as yaml from "yaml";
import * as clc from "colorette";
import * as path from "path";

const cwd = process.cwd();

import { checkbox, select } from "../../../prompt";
import { Config } from "../../../config";
import { Setup } from "../..";
import { loadAll } from "../../../dataconnect/load";
import {
  ConnectorInfo,
  ConnectorYaml,
  DartSDK,
  JavascriptSDK,
  KotlinSDK,
} from "../../../dataconnect/types";
import { FirebaseError } from "../../../error";
import { isArray } from "lodash";
import {
  logBullet,
  envOverride,
  logWarning,
  logLabeledSuccess,
  logLabeledWarning,
  logLabeledBullet,
  newUniqueId,
  logLabeledError,
  commandExistsSync,
} from "../../../utils";
import { detectApps, appDescription, Platform, App, Framework } from "../../../appUtils";
import { DataConnectEmulator } from "../../../emulator/dataconnectEmulator";
import { getGlobalDefaultAccount } from "../../../auth";
import { createFlutterApp, createNextApp, createReactApp } from "./create_app";
import { trackGA4 } from "../../../track";
import { dirExistsSync, listFiles } from "../../../fsutils";

export const FDC_APP_FOLDER = "FDC_APP_FOLDER";
export const FDC_SDK_FRAMEWORKS_ENV = "FDC_SDK_FRAMEWORKS";
export const FDC_SDK_PLATFORM_ENV = "FDC_SDK_PLATFORM";

export interface SdkRequiredInfo {
  apps: App[];
}

export type SDKInfo = {
  connectorYamlContents: string;
  connectorInfo: ConnectorInfo;
  displayIOSWarning: boolean;
};

export async function askQuestions(setup: Setup): Promise<void> {
  const info: SdkRequiredInfo = {
    apps: [],
  };

  info.apps = await chooseApp();
  if (!info.apps.length) {
    const npxMissingWarning = commandExistsSync("npx")
      ? ""
      : clc.yellow(" (you need to install Node.js first)");
    const flutterMissingWarning = commandExistsSync("flutter")
      ? ""
      : clc.yellow(" (you need to install Flutter first)");

    const choice = await select({
      message: `Do you want to create an app template?`,
      choices: [
        // TODO: Create template tailored to FDC.
        { name: `React${npxMissingWarning}`, value: "react" },
        { name: `Next.JS${npxMissingWarning}`, value: "next" },
        { name: `Flutter${flutterMissingWarning}`, value: "flutter" },
        { name: "skip", value: "skip" },
      ],
    });
    try {
      switch (choice) {
        case "react":
          await createReactApp(newUniqueId("web-app", listFiles(cwd)));
          break;
        case "next":
          await createNextApp(newUniqueId("web-app", listFiles(cwd)));
          break;
        case "flutter":
          await createFlutterApp(newUniqueId("flutter_app", listFiles(cwd)));
          break;
        case "skip":
          break;
      }
    } catch (err: unknown) {
      // The detailed error message are already piped into stderr. No need to repeat here.
      logLabeledError("dataconnect", `Failed to create a ${choice} app template`);
    }
  }

  setup.featureInfo = setup.featureInfo || {};
  setup.featureInfo.dataconnectSdk = info;
}

export async function chooseApp(): Promise<App[]> {
  let apps = dedupeAppsByPlatformAndDirectory(await detectApps(cwd));
  if (apps.length) {
    logLabeledSuccess(
      "dataconnect",
      `Detected existing apps ${apps.map((a) => appDescription(a)).join(", ")}`,
    );
  } else {
    logLabeledWarning("dataconnect", "Cannot detect any existing apps in the current directory.");
  }
  // Check for environment variables override.
  const envAppFolder = envOverride(FDC_APP_FOLDER, "");
  const envPlatform: Platform = envOverride(FDC_SDK_PLATFORM_ENV, "") as Platform;
  const envFrameworks: Framework[] = envOverride(FDC_SDK_FRAMEWORKS_ENV, "")
    .split(",")
    .filter((f) => !!f)
    .map((f) => f as Framework);
  if (envAppFolder && envPlatform) {
    // Resolve the relative path to the app directory
    const envAppRelDir = path.relative(cwd, path.resolve(cwd, envAppFolder));
    const matchedApps = apps.filter(
      (app) => app.directory === envAppRelDir && (!app.platform || app.platform === envPlatform),
    );
    if (matchedApps.length) {
      for (const a of matchedApps) {
        a.frameworks = [...(a.frameworks || []), ...envFrameworks];
      }
      return matchedApps;
    }
    return [
      {
        platform: envPlatform,
        directory: envAppRelDir,
        frameworks: envFrameworks,
      },
    ];
  }
  if (apps.length >= 2) {
    const choices = apps.map((a) => {
      return {
        name: appDescription(a),
        value: a,
        checked: a.directory === ".",
      };
    });
    const pickedApps = await checkbox<App>({
      message: "Which apps do you want to set up Data Connect SDKs in?",
      choices,
    });
    if (!pickedApps || !pickedApps.length) {
      throw new FirebaseError("Command Aborted. Please choose at least one app.");
    }
    apps = pickedApps;
  }
  return apps;
}

export async function actuate(setup: Setup, config: Config) {
  const sdkInfo = setup.featureInfo?.dataconnectSdk;
  if (!sdkInfo) {
    throw new Error("Data Connect SDK feature RequiredInfo is not provided");
  }
  const startTime = Date.now();
  try {
    await actuateWithInfo(setup, config, sdkInfo);
  } finally {
    // If `firebase init dataconnect:sdk` is run alone, emit GA stats.
    // Otherwise, `firebase init dataconnect` will emit those stats.
    const fdcInfo = setup.featureInfo?.dataconnect;
    if (!fdcInfo) {
      void trackGA4(
        "dataconnect_init",
        {
          flow: "cli_sdk",
          project_status: setup.projectId
            ? setup.isBillingEnabled
              ? "blaze"
              : "spark"
            : "missing",
          ...initAppCounters(sdkInfo),
        },
        Date.now() - startTime,
      );
    }
  }
}

export function initAppCounters(info: SdkRequiredInfo): { [key: string]: number } {
  const counts = {
    num_web_apps: 0,
    num_android_apps: 0,
    num_ios_apps: 0,
    num_flutter_apps: 0,
  };

  for (const app of info.apps ?? []) {
    switch (app.platform) {
      case Platform.WEB:
        counts.num_web_apps++;
        break;
      case Platform.ANDROID:
        counts.num_android_apps++;
        break;
      case Platform.IOS:
        counts.num_ios_apps++;
        break;
      case Platform.FLUTTER:
        counts.num_flutter_apps++;
        break;
    }
  }
  return counts;
}

async function actuateWithInfo(setup: Setup, config: Config, info: SdkRequiredInfo) {
  if (!info.apps.length) {
    // If no apps is specified, try to detect it again.
    // In `firebase init dataconnect:sdk`, customer may create the app while the command is running.
    // The `firebase_init` MCP tool always pass an empty `apps` list, it should setup all apps detected.
    info.apps = await detectApps(cwd);
    if (!info.apps.length) {
      logLabeledBullet("dataconnect", "No apps to setup Data Connect Generated SDKs");
      return;
    }
  }

  // detectApps creates unique apps by appId and bundleId, but this method operates
  // on platform, directory, and frameworks alone. Deduping here to retain the
  // same behavior
  const apps = dedupeAppsByPlatformAndDirectory(info.apps);
  const connectorInfo = await chooseExistingConnector(setup, config);
  const connectorYaml = JSON.parse(JSON.stringify(connectorInfo.connectorYaml)) as ConnectorYaml;
  for (const app of apps) {
    if (!dirExistsSync(app.directory)) {
      logLabeledWarning("dataconnect", `App directory ${app.directory} does not exist`);
    }
    addSdkGenerateToConnectorYaml(connectorInfo, connectorYaml, app);
  }

  // TODO: Prompt user about adding generated paths to .gitignore
  const connectorYamlContents = yaml.stringify(connectorYaml);
  connectorInfo.connectorYaml = connectorYaml;

  const connectorYamlPath = `${connectorInfo.directory}/connector.yaml`;
  config.writeProjectFile(
    path.relative(config.projectDir, connectorYamlPath),
    connectorYamlContents,
  );

  logLabeledBullet("dataconnect", `Installing the generated SDKs ...`);
  const account = getGlobalDefaultAccount();
  try {
    await DataConnectEmulator.generate({
      configDir: connectorInfo.directory,
      account,
    });
  } catch (e: any) {
    logLabeledError("dataconnect", `Failed to generate Data Connect SDKs\n${e?.message}`);
  }

  logLabeledSuccess(
    "dataconnect",
    `Installed generated SDKs for ${clc.bold(apps.map((a) => appDescription(a)).join(", "))}`,
  );
  if (apps.some((a) => a.platform === Platform.IOS)) {
    logBullet(
      clc.bold(
        "Please follow the instructions here to add your generated sdk to your XCode project:\n\thttps://firebase.google.com/docs/data-connect/ios-sdk#set-client",
      ),
    );
  }
  if (apps.some((a) => a.frameworks?.includes(Framework.REACT))) {
    logBullet(
      "Visit https://firebase.google.com/docs/data-connect/web-sdk#react for more information on how to set up React Generated SDKs for Firebase Data Connect",
    );
  }
  if (apps.some((a) => a.frameworks?.includes(Framework.ANGULAR))) {
    logBullet(
      "Run `ng add @angular/fire` to install angular sdk dependencies.\nVisit https://github.com/invertase/tanstack-query-firebase/tree/main/packages/angular for more information on how to set up Angular Generated SDKs for Firebase Data Connect",
    );
  }
}

interface connectorChoice {
  name: string; // {location}/{serviceId}/{connectorId}
  value: ConnectorInfo;
}

/**
 * Picks an existing connector from those present in the local workspace.
 *
 * Firebase Console can provide `FDC_CONNECTOR` environment variable.
 * If its is present, chooseExistingConnector try to match it with any existing connectors
 * and short-circuit the prompt.
 *
 * `FDC_CONNECTOR` should have the same `<location>/<serviceId>/<connectorId>`.
 * @param choices
 */
async function chooseExistingConnector(setup: Setup, config: Config): Promise<ConnectorInfo> {
  const serviceInfos = await loadAll(setup.projectId || "", config);
  const choices: connectorChoice[] = serviceInfos
    .map((si) => {
      return si.connectorInfo.map((ci) => {
        return {
          name: `${si.dataConnectYaml.location}/${si.dataConnectYaml.serviceId}/${ci.connectorYaml.connectorId}`,
          value: ci,
        };
      });
    })
    .flat();
  if (!choices.length) {
    throw new FirebaseError(
      `No Firebase Data Connect workspace found. Run ${clc.bold("firebase init dataconnect")} to set up a service and connector.`,
    );
  }
  if (choices.length === 1) {
    // Only one connector available, use it.
    return choices[0].value;
  }
  const connectorEnvVar = envOverride("FDC_CONNECTOR", "");
  if (connectorEnvVar) {
    const existingConnector = choices.find((c) => c.name === connectorEnvVar);
    if (existingConnector) {
      logBullet(`Picking up the existing connector ${clc.bold(connectorEnvVar)}.`);
      return existingConnector.value;
    }
    logWarning(
      `Unable to pick up an existing connector based on FDC_CONNECTOR=${connectorEnvVar}.`,
    );
  }
  logWarning(
    `Pick up the first connector ${clc.bold(connectorEnvVar)}. Use FDC_CONNECTOR to override it`,
  );
  return choices[0].value;
}

/** add SDK generation configuration to connector.yaml in place */
export function addSdkGenerateToConnectorYaml(
  connectorInfo: ConnectorInfo,
  connectorYaml: ConnectorYaml,
  app: App,
): void {
  const connectorDir = connectorInfo.directory;
  const appDir = app.directory;
  if (!connectorYaml.generate) {
    connectorYaml.generate = {};
  }
  const generate = connectorYaml.generate;

  switch (app.platform) {
    case Platform.WEB: {
      const javascriptSdk: JavascriptSDK = {
        outputDir: path.relative(connectorDir, path.join(appDir, `src/dataconnect-generated`)),
        package: `@dataconnect/generated`,
        packageJsonDir: path.relative(connectorDir, appDir),
        react: false,
        angular: false,
      };
      for (const f of app.frameworks || []) {
        javascriptSdk[f] = true;
      }
      if (!isArray(generate?.javascriptSdk)) {
        generate.javascriptSdk = generate.javascriptSdk ? [generate.javascriptSdk] : [];
      }
      if (!generate.javascriptSdk.some((s) => s.outputDir === javascriptSdk.outputDir)) {
        generate.javascriptSdk.push(javascriptSdk);
      }
      break;
    }
    case Platform.FLUTTER: {
      const dartSdk: DartSDK = {
        outputDir: path.relative(connectorDir, path.join(appDir, `lib/dataconnect_generated`)),
        package: "dataconnect_generated",
      };
      if (!isArray(generate?.dartSdk)) {
        generate.dartSdk = generate.dartSdk ? [generate.dartSdk] : [];
      }
      if (!generate.dartSdk.some((s) => s.outputDir === dartSdk.outputDir)) {
        generate.dartSdk.push(dartSdk);
      }
      break;
    }
    case Platform.ANDROID: {
      const kotlinSdk: KotlinSDK = {
        outputDir: path.relative(connectorDir, path.join(appDir, `src/main/kotlin`)),
        package: `com.google.firebase.dataconnect.generated`,
      };
      if (!isArray(generate?.kotlinSdk)) {
        generate.kotlinSdk = generate.kotlinSdk ? [generate.kotlinSdk] : [];
      }
      if (!generate.kotlinSdk.some((s) => s.outputDir === kotlinSdk.outputDir)) {
        generate.kotlinSdk.push(kotlinSdk);
      }
      break;
    }
    case Platform.IOS: {
      const swiftSdk = {
        outputDir: path.relative(
          connectorDir,
          path.join(app.directory, `../FirebaseDataConnectGenerated`),
        ),
        package: "DataConnectGenerated",
      };
      if (!isArray(generate?.swiftSdk)) {
        generate.swiftSdk = generate.swiftSdk ? [generate.swiftSdk] : [];
      }
      if (!generate.swiftSdk.some((s) => s.outputDir === swiftSdk.outputDir)) {
        generate.swiftSdk.push(swiftSdk);
      }
      break;
    }
    default:
      throw new FirebaseError(
        `Unsupported platform ${app.platform} for Data Connect SDK generation. Supported platforms are: ${Object.values(
          Platform,
        ).join(", ")}\n${JSON.stringify(app)}`,
      );
  }
}

function dedupeAppsByPlatformAndDirectory(apps: App[]): App[] {
  // detectApps creates unique apps by appId and bundleId, but this method operates
  // on platform, directory, and frameworks alone. Deduping here to retain the
  // same behavior
  const uniqueApps = new Map<string, App>();
  for (const app of apps) {
    // Sorting frameworks for consistent key generation
    const frameworkKey = app.frameworks ? [...app.frameworks].sort().join(",") : "";
    const key = `${app.platform}:${app.directory}:${frameworkKey}`;
    if (!uniqueApps.has(key)) {
      const minifiedApp: App = {
        platform: app.platform,
        directory: app.directory,
      };

      if (app.frameworks?.length) {
        minifiedApp.frameworks = [...app.frameworks];
      }

      // Create a new object with only the desired properties to avoid carrying over others like appId
      uniqueApps.set(key, minifiedApp);
    }
  }
  return Array.from(uniqueApps.values());
}
