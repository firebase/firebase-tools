import * as yaml from "yaml";
import * as fs from "fs";
import * as clc from "colorette";
import * as path from "path";

import { dirExistsSync } from "../../../fsutils";
import { confirm, promptForDirectory, promptOnce } from "../../../prompt";
import { readFirebaseJson, getPlatformFromFolder } from "../../../dataconnect/fileUtils";
import { Config } from "../../../config";
import { Setup } from "../..";
import { load } from "../../../dataconnect/load";
import {
  ConnectorInfo,
  ConnectorYaml,
  DartSDK,
  JavascriptSDK,
  KotlinSDK,
  Platform,
} from "../../../dataconnect/types";
import { DataConnectEmulator } from "../../../emulator/dataconnectEmulator";
import { FirebaseError } from "../../../error";
import { camelCase, snakeCase, upperFirst } from "lodash";
import { logSuccess, logBullet } from "../../../utils";

export const FDC_APP_FOLDER = "_FDC_APP_FOLDER";
export type SDKInfo = {
  connectorYamlContents: string;
  connectorInfo: ConnectorInfo;
  shouldGenerate: boolean;
  displayIOSWarning: boolean;
};
export async function doSetup(setup: Setup, config: Config): Promise<void> {
  const sdkInfo = await askQuestions(setup, config);
  await actuate(sdkInfo, setup.projectId);
  logSuccess(
    `If you'd like to generate additional SDKs later, run ${clc.bold("firebase init dataconnect:sdk")}`,
  );
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
      )} to set up a service and connectors.`,
    );
  }

  // First, lets check if we are in a app directory
  let targetPlatform: Platform = Platform.UNDETERMINED;
  let appDir = process.env[FDC_APP_FOLDER] || process.cwd();
  const cwdPlatformGuess = await getPlatformFromFolder(appDir);
  if (cwdPlatformGuess !== Platform.UNDETERMINED) {
    // If we are, we'll use that directory
    logSuccess(`Detected ${cwdPlatformGuess} app in directory ${appDir}`);
    targetPlatform = cwdPlatformGuess;
  } else {
    // If we aren't, ask the user where their app is, and try to autodetect from there
    logBullet(`Couldn't automatically detect your app directory.`);
    appDir =
      process.env[FDC_APP_FOLDER] ??
      (await promptForDirectory({
        config,
        message:
          "Where is your app directory? Leave blank to set up a generated SDK in your current directory.",
      }));
    const platformGuess = await getPlatformFromFolder(appDir);
    if (platformGuess !== Platform.UNDETERMINED) {
      logSuccess(`Detected ${platformGuess} app in directory ${appDir}`);
      targetPlatform = platformGuess;
    } else {
      // If we still can't autodetect, just ask the user
      logBullet("Couldn't automatically detect your app's platform.");
      const platforms = [
        { name: "iOS (Swift)", value: Platform.IOS },
        { name: "Web (JavaScript)", value: Platform.WEB },
        { name: "Android (Kotlin)", value: Platform.ANDROID },
        { name: "Flutter (Dart)", value: Platform.DART },
      ];
      targetPlatform = await promptOnce({
        message: "Which platform do you want to set up a generated SDK for?",
        type: "list",
        choices: platforms,
      });
    }
  }

  const connectorInfo: ConnectorInfo = await promptOnce({
    message: "Which connector do you want set up a generated SDK for?",
    type: "list",
    choices: connectorChoices,
  });

  const connectorYaml = JSON.parse(JSON.stringify(connectorInfo.connectorYaml)) as ConnectorYaml;
  const newConnectorYaml = generateSdkYaml(
    targetPlatform,
    connectorYaml,
    connectorInfo.directory,
    appDir,
  );

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
  const displayIOSWarning = targetPlatform === Platform.IOS;
  return { connectorYamlContents, connectorInfo, shouldGenerate, displayIOSWarning };
}

export function generateSdkYaml(
  targetPlatform: Platform,
  connectorYaml: ConnectorYaml,
  connectorDir: string,
  appDir: string,
): ConnectorYaml {
  if (!connectorYaml.generate) {
    connectorYaml.generate = {};
  }

  if (targetPlatform === Platform.IOS) {
    const swiftSdk = {
      outputDir: path.relative(connectorDir, path.join(appDir, `dataconnect-generated/swift`)),
      package: upperFirst(camelCase(connectorYaml.connectorId)),
    };
    connectorYaml.generate.swiftSdk = swiftSdk;
  }

  if (targetPlatform === Platform.WEB) {
    const javascriptSdk: JavascriptSDK = {
      outputDir: path.relative(
        connectorDir,
        path.join(appDir, `dataconnect-generated/js/${connectorYaml.connectorId}`),
      ),
      package: `@firebasegen/${connectorYaml.connectorId}`,
      // If appDir has package.json, Emulator would install JS SDK for every reload.
      // Otherwise, emulator would ignore it. Always add it here in case `package.json` is added later.
      // TODO: Explore other platforms that can be automatically installed. Dart? Android?
      packageJsonDir: path.relative(connectorDir, appDir),
    };
    connectorYaml.generate.javascriptSdk = javascriptSdk;
  }

  if (targetPlatform === Platform.DART) {
    const dartSdk: DartSDK = {
      outputDir: path.relative(
        connectorDir,
        path.join(appDir, `dataconnect-generated/dart/${connectorYaml.connectorId}`),
      ),
      package: connectorYaml.connectorId,
    };
    connectorYaml.generate.dartSdk = dartSdk;
  }

  if (targetPlatform === Platform.ANDROID) {
    const kotlinSdk: KotlinSDK = {
      outputDir: path.relative(connectorDir, path.join(appDir, `dataconnect-generated/kotlin`)),
      package: `connectors.${snakeCase(connectorYaml.connectorId)}`,
    };
    // app/src/main/kotlin and app/src/main/java are conventional for Android,
    // but not required or enforced. If one of them is present (preferring the
    // "kotlin" directory), use it. Otherwise, fall back to the dataconnect-generated dir.
    for (const candidateSubdir of ["app/src/main/java", "app/src/main/kotlin"]) {
      const candidateDir = path.join(appDir, candidateSubdir);
      if (dirExistsSync(candidateDir)) {
        kotlinSdk.outputDir = path.relative(connectorDir, candidateDir);
      }
    }
    connectorYaml.generate.kotlinSdk = kotlinSdk;
  }

  return connectorYaml;
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
