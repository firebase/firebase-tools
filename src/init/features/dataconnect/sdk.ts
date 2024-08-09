import * as yaml from "yaml";
import * as fs from "fs";
import * as clc from "colorette";
import * as path from "path";

import { confirm, promptForDirectory, promptOnce } from "../../../prompt";
import {
  readFirebaseJson,
  getPlatformFromFolder,
  directoryHasPackageJson,
} from "../../../dataconnect/fileUtils";
import { Config } from "../../../config";
import { Setup } from "../..";
import { load } from "../../../dataconnect/load";
import {
  ConnectorInfo,
  ConnectorYaml,
  JavascriptSDK,
  KotlinSDK,
  Platform,
} from "../../../dataconnect/types";
import { DataConnectEmulator } from "../../../emulator/dataconnectEmulator";
import { FirebaseError } from "../../../error";
import { camelCase, snakeCase, upperFirst } from "lodash";
import { logSuccess, logBullet } from "../../../utils";

export type SDKInfo = {
  connectorYamlContents: string;
  connectorInfo: ConnectorInfo;
  shouldGenerate: boolean;
  displayIOSWarning: boolean;
};
export async function doSetup(setup: Setup, config: Config): Promise<void> {
  const sdkInfo = await askQuestions(setup, config);
  await actuate(sdkInfo, setup.projectId);
}

async function askQuestions(setup: Setup, config: Config): Promise<SDKInfo> {
  const serviceCfgs = readFirebaseJson(config);
  // TODO: This current approach removes comments from YAML files. Consider a different approach that won't.
  const serviceInfos = await Promise.all(
    serviceCfgs.map((c) => load(setup.projectId || "", config, c.source)),
  );
  const connectorChoices: { name: string; value: ConnectorInfo }[] = serviceInfos
    .map((si) => {
      return si.connectorInfo.map((ci) => {
        return {
          name: `${si.dataConnectYaml.serviceId}/${ci.connectorYaml.connectorId}`,
          value: ci,
        };
      });
    })
    .flat();
  if (!connectorChoices.length) {
    throw new FirebaseError(
      `Your config has no connectors to set up SDKs for. Run ${clc.bold(
        "firebase init dataconnect",
      )} to set up a service and conenctors.`,
    );
  }
  const connectorInfo: ConnectorInfo = await promptOnce({
    message: "Which connector do you want set up a generated SDK for?",
    type: "list",
    choices: connectorChoices,
  });

  // First, lets check if we are in a app directory
  let targetPlatform: Platform = Platform.UNDETERMINED;
  let appDir: string;
  const cwdPlatformGuess = await getPlatformFromFolder(process.cwd());
  if (cwdPlatformGuess !== Platform.UNDETERMINED) {
    // If we are, we'll use that directory
    logSuccess(`Detected ${cwdPlatformGuess} app in current directory ${process.cwd()}`);
    targetPlatform = cwdPlatformGuess;
    appDir = process.cwd();
  } else {
    // If we aren't, ask the user where their app is, and try to autodetect from there
    logBullet(`Couldn't automatically detect your app directory.`);
    appDir = await promptForDirectory({
      config,
      message: "Where is your app directory?",
    });
    const platformGuess = await getPlatformFromFolder(appDir);
    if (platformGuess !== Platform.UNDETERMINED) {
      logSuccess(`Detected ${platformGuess} app in directory ${appDir}`);
      targetPlatform = platformGuess;
    } else {
      // If we still can't autodetect, just ask the user
      logBullet("Couldn't automatically detect your app's platform.");
      targetPlatform = await promptOnce({
        message: "Which platform do you want to set up a generated SDK for?",
        type: "list",
        choices: [
          { name: "iOS (Swift)", value: Platform.IOS },
          { name: "Web (JavaScript)", value: Platform.WEB },
          { name: "Android (Kotlin)", value: Platform.ANDROID },
        ],
      });
    }
  }

  const newConnectorYaml = JSON.parse(JSON.stringify(connectorInfo.connectorYaml)) as ConnectorYaml;
  if (!newConnectorYaml.generate) {
    newConnectorYaml.generate = {};
  }

  let displayIOSWarning = false;
  if (targetPlatform === Platform.IOS) {
    const outputDir =
      newConnectorYaml.generate.swiftSdk?.outputDir ||
      path.relative(connectorInfo.directory, path.join(appDir, `generated/swift`));
    const pkg =
      newConnectorYaml.generate.swiftSdk?.package ??
      upperFirst(camelCase(newConnectorYaml.connectorId));
    const swiftSdk = { outputDir, package: pkg };
    newConnectorYaml.generate.swiftSdk = swiftSdk;
    displayIOSWarning = true;
  }

  if (targetPlatform === Platform.WEB) {
    const outputDir =
      newConnectorYaml.generate.javascriptSdk?.outputDir ||
      path.relative(
        connectorInfo.directory,
        path.join(appDir, `generated/javascript/${newConnectorYaml.connectorId}`),
      );
    const pkg =
      newConnectorYaml.generate.javascriptSdk?.package ??
      `@firebasegen/${connectorInfo.connectorYaml.connectorId}`;

    const javascriptSdk: JavascriptSDK = {
      outputDir,
      package: pkg,
    };

    if (
      (await directoryHasPackageJson(appDir)) &&
      (await confirm({
        message: "Would you like to add a dependency on the generated SDK to your package.json?",
      }))
    ) {
      javascriptSdk.packageJsonDir = path.relative(connectorInfo.directory, appDir);
    }
    newConnectorYaml.generate.javascriptSdk = javascriptSdk;
  }

  if (targetPlatform === Platform.ANDROID) {
    // app/src/main/kotlin and app/src/main/java are conventional for Android,
    // but not required or enforced. If one of them is present (preferring the
    // "kotlin" directory), use it. Otherwise, fall back to the app directory.
    let baseDir = path.join(appDir, `generated/kotlin`);
    for (const candidateSubdir of ["app/src/main/java", "app/src/main/kotlin"]) {
      const candidateDir = path.join(appDir, candidateSubdir);
      if (fs.existsSync(candidateDir)) {
        baseDir = candidateDir;
      }
    }

    const outputDir =
      newConnectorYaml.generate.kotlinSdk?.outputDir ||
      path.relative(connectorInfo.directory, baseDir);
    const pkg =
      newConnectorYaml.generate.kotlinSdk?.package ??
      `connectors.${snakeCase(connectorInfo.connectorYaml.connectorId)}`;
    const kotlinSdk: KotlinSDK = {
      outputDir,
      package: pkg,
    };
    newConnectorYaml.generate.kotlinSdk = kotlinSdk;
  }

  const shouldGenerate = !!(
    setup.projectId &&
    (await confirm({
      message: "Would you like to generate SDK code now?",
      default: true,
    }))
  );
  // TODO: Prompt user about adding generated paths to .gitignore
  const connectorYamlContents = yaml.stringify(newConnectorYaml);
  connectorInfo.connectorYaml = newConnectorYaml;
  return { connectorYamlContents, connectorInfo, shouldGenerate, displayIOSWarning };
}

export async function actuate(sdkInfo: SDKInfo, projectId?: string) {
  const connectorYamlPath = `${sdkInfo.connectorInfo.directory}/connector.yaml`;
  fs.writeFileSync(connectorYamlPath, sdkInfo.connectorYamlContents, "utf8");
  logBullet(`Wrote new config to ${connectorYamlPath}`);
  if (projectId && sdkInfo.shouldGenerate) {
    await DataConnectEmulator.generate({
      configDir: sdkInfo.connectorInfo.directory,
      connectorId: sdkInfo.connectorInfo.connectorYaml.connectorId,
    });
    logBullet(`Generated SDK code for ${sdkInfo.connectorInfo.connectorYaml.connectorId}`);
  }
  if (sdkInfo.connectorInfo.connectorYaml.generate?.swiftSdk && sdkInfo.displayIOSWarning) {
    logBullet(
      clc.bold(
        "Please follow the instructions here to add your generated sdk to your XCode project:\n\thttps://firebase.google.com/docs/data-connect/gp/ios-sdk#set-client",
      ),
    );
  }
}
