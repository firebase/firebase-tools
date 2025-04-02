import * as yaml from "yaml";
import * as clc from "colorette";
import * as path from "path";

import { dirExistsSync } from "../../../fsutils";
import { promptForDirectory, promptOnce, prompt } from "../../../prompt";
import {
  readFirebaseJson,
  getPlatformFromFolder,
  getFrameworksFromPackageJson,
  resolvePackageJson,
  SUPPORTED_FRAMEWORKS,
} from "../../../dataconnect/fileUtils";
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
  SupportedFrameworks,
} from "../../../dataconnect/types";
import { DataConnectEmulator } from "../../../emulator/dataconnectEmulator";
import { FirebaseError } from "../../../error";
import { camelCase, snakeCase, upperFirst } from "lodash";
import { logSuccess, logBullet } from "../../../utils";
import { getGlobalDefaultAccount } from "../../../auth";

export const FDC_APP_FOLDER = "_FDC_APP_FOLDER";
export type SDKInfo = {
  connectorYamlContents: string;
  connectorInfo: ConnectorInfo;
  displayIOSWarning: boolean;
};
export async function doSetup(setup: Setup, config: Config): Promise<void> {
  const sdkInfo = await askQuestions(setup, config);
  await actuate(sdkInfo, config);
  logSuccess(
    `If you'd like to add more generated SDKs to your app your later, run ${clc.bold("firebase init dataconnect:sdk")} again`,
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

  // First, lets check if we are in an app directory
  let appDir = process.env[FDC_APP_FOLDER] || process.cwd();
  let targetPlatform = await getPlatformFromFolder(appDir);
  if (targetPlatform === Platform.NONE && !process.env[FDC_APP_FOLDER]?.length) {
    // If we aren't in an app directory, ask the user where their app is, and try to autodetect from there.
    appDir = await promptForDirectory({
      config,
      message:
        "Where is your app directory? Leave blank to set up a generated SDK in your current directory.",
    });
    targetPlatform = await getPlatformFromFolder(appDir);
  }
  if (targetPlatform === Platform.NONE || targetPlatform === Platform.MULTIPLE) {
    if (targetPlatform === Platform.NONE) {
      logBullet(`Couldn't automatically detect app your in directory ${appDir}.`);
    } else {
      logSuccess(`Detected multiple app platforms in directory ${appDir}`);
      // Can only setup one platform at a time, just ask the user
    }
    const platforms = [
      { name: "iOS (Swift)", value: Platform.IOS },
      { name: "Web (JavaScript)", value: Platform.WEB },
      { name: "Android (Kotlin)", value: Platform.ANDROID },
      { name: "Flutter (Dart)", value: Platform.FLUTTER },
    ];
    targetPlatform = await promptOnce({
      message: "Which platform do you want to set up a generated SDK for?",
      type: "list",
      choices: platforms,
    });
  } else {
    logSuccess(`Detected ${targetPlatform} app in directory ${appDir}`);
  }

  const connectorInfo: ConnectorInfo = await promptOnce({
    message: "Which connector do you want set up a generated SDK for?",
    type: "list",
    choices: connectorChoices,
  });

  const connectorYaml = JSON.parse(JSON.stringify(connectorInfo.connectorYaml)) as ConnectorYaml;
  const newConnectorYaml = await generateSdkYaml(
    targetPlatform,
    connectorYaml,
    connectorInfo.directory,
    appDir,
  );
  if (targetPlatform === Platform.WEB) {
    const unusedFrameworks = SUPPORTED_FRAMEWORKS.filter(
      (framework) => !newConnectorYaml!.generate?.javascriptSdk![framework],
    );
    const hasFrameworkEnabled = unusedFrameworks.length < SUPPORTED_FRAMEWORKS.length;
    if (unusedFrameworks.length > 0) {
      const additionalFrameworks: { fdcFrameworks: (keyof SupportedFrameworks)[] } = await prompt(
        setup,
        [
          {
            type: "checkbox",
            name: "fdcFrameworks",
            message:
              `Which ${hasFrameworkEnabled ? "additional " : ""}frameworks would you like to generate SDKs for? ` +
              "Press Space to select features, then Enter to confirm your choices.",
            choices: unusedFrameworks.map((frameworkStr) => ({
              value: frameworkStr,
              name: frameworkStr,
              checked: false,
            })),
          },
        ],
      );
      for (const framework of additionalFrameworks.fdcFrameworks) {
        newConnectorYaml!.generate!.javascriptSdk![framework] = true;
      }
    }
  }

  // TODO: Prompt user about adding generated paths to .gitignore
  const connectorYamlContents = yaml.stringify(newConnectorYaml);
  connectorInfo.connectorYaml = newConnectorYaml;
  const displayIOSWarning = targetPlatform === Platform.IOS;
  return { connectorYamlContents, connectorInfo, displayIOSWarning };
}

export async function generateSdkYaml(
  targetPlatform: Platform,
  connectorYaml: ConnectorYaml,
  connectorDir: string,
  appDir: string,
): Promise<ConnectorYaml> {
  if (!connectorYaml.generate) {
    connectorYaml.generate = {};
  }

  if (targetPlatform === Platform.IOS) {
    const swiftSdk = {
      outputDir: path.relative(connectorDir, path.join(appDir, `dataconnect-generated/swift`)),
      package: upperFirst(camelCase(connectorYaml.connectorId)) + "Connector",
    };
    connectorYaml.generate.swiftSdk = swiftSdk;
  }

  if (targetPlatform === Platform.WEB) {
    const pkg = `${connectorYaml.connectorId}-connector`;
    const packageJsonDir = path.relative(connectorDir, appDir);
    const javascriptSdk: JavascriptSDK = {
      outputDir: path.relative(connectorDir, path.join(appDir, `dataconnect-generated/js/${pkg}`)),
      package: `@firebasegen/${pkg}`,
      // If appDir has package.json, Emulator would add Generated JS SDK to `package.json`.
      // Otherwise, emulator would ignore it. Always add it here in case `package.json` is added later.
      // TODO: Explore other platforms that can be automatically installed. Dart? Android?
      packageJsonDir,
    };
    const packageJson = await resolvePackageJson(appDir);
    if (packageJson) {
      const frameworksUsed = getFrameworksFromPackageJson(packageJson);
      for (const framework of frameworksUsed) {
        logBullet(`Detected ${framework} app. Enabling ${framework} generated SDKs.`);
        javascriptSdk[framework] = true;
      }
    }

    connectorYaml.generate.javascriptSdk = javascriptSdk;
  }

  if (targetPlatform === Platform.FLUTTER) {
    const pkg = `${snakeCase(connectorYaml.connectorId)}_connector`;
    const dartSdk: DartSDK = {
      outputDir: path.relative(
        connectorDir,
        path.join(appDir, `dataconnect-generated/dart/${pkg}`),
      ),
      package: pkg,
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

export async function actuate(sdkInfo: SDKInfo, config: Config) {
  const connectorYamlPath = `${sdkInfo.connectorInfo.directory}/connector.yaml`;
  logBullet(`Writing your new SDK configuration to ${connectorYamlPath}`);
  await config.askWriteProjectFile(
    path.relative(config.projectDir, connectorYamlPath),
    sdkInfo.connectorYamlContents,
  );

  const account = getGlobalDefaultAccount();
  await DataConnectEmulator.generate({
    configDir: sdkInfo.connectorInfo.directory,
    connectorId: sdkInfo.connectorInfo.connectorYaml.connectorId,
    account,
  });
  logBullet(`Generated SDK code for ${sdkInfo.connectorInfo.connectorYaml.connectorId}`);
  if (sdkInfo.connectorInfo.connectorYaml.generate?.swiftSdk && sdkInfo.displayIOSWarning) {
    logBullet(
      clc.bold(
        "Please follow the instructions here to add your generated sdk to your XCode project:\n\thttps://firebase.google.com/docs/data-connect/ios-sdk#set-client",
      ),
    );
  }
  if (sdkInfo.connectorInfo.connectorYaml.generate?.javascriptSdk) {
    for (const framework of SUPPORTED_FRAMEWORKS) {
      if (sdkInfo.connectorInfo.connectorYaml!.generate!.javascriptSdk![framework]) {
        logInfoForFramework(framework);
      }
    }
  }
}

function logInfoForFramework(framework: keyof SupportedFrameworks) {
  if (framework === "react") {
    logBullet(
      "Visit https://firebase.google.com/docs/data-connect/web-sdk#react for more information on how to set up React Generated SDKs for Firebase Data Connect",
    );
  } else if (framework === "angular") {
    // TODO(mtewani): Replace this with `ng add @angular/fire` when ready.
    logBullet(
      "Run `npm i --save @angular/fire @tanstack-query-firebase/angular @tanstack/angular-query-experimental` to install angular sdk dependencies.\nVisit https://github.com/invertase/tanstack-query-firebase/tree/main/packages/angular for more information on how to set up Angular Generated SDKs for Firebase Data Connect",
    );
  }
}
