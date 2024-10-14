import * as path from "path";
import * as fs from "fs-extra";
import { Command } from "../command";
import { getPlatformFromFolder } from "../dataconnect/fileUtils";
import { Platform } from "../dataconnect/types";
import { FDC_APP_FOLDER } from "../init/features/dataconnect/sdk";
import {
  AppConfigurationData,
  AppPlatform,
  getAppConfigFile,
  getAppPlatform,
} from "../management/apps";
import { Options } from "../options";
import { promptForDirectory, promptOnce } from "../prompt";
import { requireAuth } from "../requireAuth";
import { logBullet, logSuccess } from "../utils";
import { getSdkConfig, writeConfigToFile } from "./apps-sdkconfig";
import { logError } from "../logError";
import { sdkInit } from "./apps-create";
import { readTemplate } from "../templates";
import { FirebaseError } from "../error";
export function getSdkOutputDir(appDir: string, platform: Platform): string {
  switch (platform) {
    case Platform.ANDROID:
      return path.join(appDir, "app/google-services.json");
    case Platform.WEB:
      // TODO(mtewani): Make this return a js file instead.
      return path.join(appDir, "firebase-js-auto-init");
    case Platform.IOS:
      return path.join(appDir, "GoogleService-Info.plist");
  }
  throw new Error("Platform " + platform.toString() + " is not supported yet.");
}

export const command = new Command("apps:sdkconfig:init [appId]")
  .description("create a new Firebase app config")
  .before(requireAuth)
  .action(async (appId = "", options: Options) => {
    let targetPlatform = await getPlatformFromFolder(process.cwd());
    // TODO(mtewani): Map any -> unknown
    let appDir = process.cwd();
    const config = options.config;
    if (targetPlatform === Platform.NONE && !process.env[FDC_APP_FOLDER]?.length) {
      // If we aren't in an app directory, ask the user where their app is, and try to autodetect from there.
      appDir = await promptForDirectory({
        config,
        message:
          "Where is your app directory? Leave blank to set up an SDK in your current directory.",
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
    // TODO(mtewani): Include message for Dart
    // TODO(mtewani): Include prompt for optional appId
    let sdkConfig: any;
    while (sdkConfig === undefined) {
      try {
        sdkConfig = await getSdkConfig(options, getAppPlatform(targetPlatform), appId);
      } catch (e) {
        if ((e as Error).message.includes("associated with this Firebase project")) {
          await sdkInit(targetPlatform as unknown as AppPlatform, options);
        } else {
          throw e;
        }
      }
    }

    const outputFile = getSdkOutputDir(appDir, targetPlatform);
    if ((targetPlatform as unknown as AppPlatform) === AppPlatform.WEB) {
      const files = await getAutoInitConfigFile(
        sdkConfig,
        targetPlatform as unknown as AppPlatform,
      );
      fs.mkdirpSync(outputFile);
      for (const file of files) {
        try {
          await writeConfigToFile(
            path.join(outputFile, file.fileName),
            options.nonInteractive,
            file.fileContents,
          );
          logSuccess(`Wrote ${file.fileName}`);
        } catch (e) {
          console.log(e);
          logError(`Unable to write to output directory.`);
        }
      }
      console.log(`
            How to use your JS SDK Config:
            // ES Module:
            import { autoInitApp } from './firebase-js-auto-init/index.esm.js';
            autoInitApp(); // instead of initializeApp(config);

            // CommonJS Module:
            const { autoInitApp } = require('./firebase-js-auto-init/index.cjs.js');
            autoInitApp();// instead of initializeApp(config);
        `);
    } else {
      const fileInfo = getAppConfigFile(sdkConfig, targetPlatform as unknown as AppPlatform);
      await writeConfigToFile(outputFile, options.nonInteractive, fileInfo.fileContents);
    }
  });
async function getAutoInitConfigFile(
  responseBody: any,
  platform: AppPlatform,
): Promise<AppConfigurationData[]> {
  if (platform === AppPlatform.WEB) {
    const [esmTemplate, cjsTemplate] = await Promise.all([
      readTemplate("setup/web-auto.esm.js"),
      readTemplate("setup/web-auto.cjs.js"),
    ]);
    const REPLACE_STR = "{/*--CONFIG--*/}";
    return [
      {
        fileName: "index.esm.js",
        fileContents: esmTemplate.replace(REPLACE_STR, JSON.stringify(responseBody, null, 2)),
      },
      {
        fileName: "index.cjs.js",
        fileContents: cjsTemplate.replace(REPLACE_STR, JSON.stringify(responseBody, null, 2)),
      },
    ];
  }
  throw new FirebaseError("Unexpected app platform");
}
