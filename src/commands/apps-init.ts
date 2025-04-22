import * as fs from "fs-extra";
import * as path from "path";

import { Command } from "../command";
import {
  AppConfig,
  AppPlatform,
  getAppConfigFile,
  getAppPlatform,
  getPlatform,
  getSdkConfig,
  getSdkOutputPath,
  sdkInit,
  writeConfigToFile,
} from "../management/apps";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { Platform } from "../dataconnect/types";
import { assertEnabled } from "../experiments";

export interface AppsInitOptions extends Options {
  out?: string | boolean;
}

function logUse(platform: AppPlatform, filePath: string) {
  switch (platform) {
    case AppPlatform.WEB:
      logger.info(`
How to use your JS SDK Config:
ES Module:
import { initializeApp } from 'firebase/app';
import json from './${filePath || "firebase-sdk-config.json"}';
initializeApp(json); // or copy and paste the config directly from the json file here
// CommonJS Module:
const { initializeApp } = require('firebase/app');
const json = require('./firebase-js-config.json');
initializeApp(json); // or copy and paste the config directly from the json file here`);
      break;
    case AppPlatform.ANDROID:
      logger.info(
        `Visit https://firebase.google.com/docs/android/setup#add-config-file
for information on editing your gradle file and adding Firebase SDKs to your app.

If you're using Unity or C++, visit https://firebase.google.com/docs/cpp/setup?platform=android#add-config-file
for information about adding your config file to your project.`,
      );
      break;
    case AppPlatform.IOS:
      logger.info(
        `Visit https://firebase.google.com/docs/ios/setup#add-config-file
for information on adding the config file to your targets and adding Firebase SDKs to your app.

If you're using Unity or C++, visit https://firebase.google.com/docs/cpp/setup?platform=ios#add-config-file
for information about adding your config file to your project.`,
      );
      break;
  }
}

function toAppPlatform(str: string) {
  switch (str.toUpperCase()) {
    case Platform.ANDROID:
      return Platform.ANDROID as unknown as AppPlatform.ANDROID;
    case Platform.IOS:
      return Platform.IOS as unknown as AppPlatform.IOS;
    case Platform.WEB:
      return Platform.WEB as unknown as AppPlatform.WEB;
  }
  throw new Error(`Platform ${str} is not compatible with apps:configure`);
}

export const command = new Command("apps:init [platform] [appId]")
  .description("automatically download and create config of a Firebase app")
  .before(requireAuth)
  .option("-o, --out [file]", "(optional) write config output to a file")
  .action(async (platform = "", appId = "", options: AppsInitOptions): Promise<AppConfig> => {
    assertEnabled("appsinit", "autoconfigure an app");
    if (typeof options.out === "boolean") {
      throw new Error("Please specify a file path to output to.");
    }
    const config = options.config;
    const appDir = process.cwd();
    // auto-detect the platform
    const detectedPlatform = platform ? toAppPlatform(platform) : await getPlatform(appDir, config);

    let sdkConfig: AppConfig | undefined;
    while (sdkConfig === undefined) {
      try {
        sdkConfig = await getSdkConfig(options, getAppPlatform(detectedPlatform), appId);
      } catch (e) {
        if ((e as Error).message.includes("associated with this Firebase project")) {
          const projectId = needProjectId(options);
          await sdkInit(detectedPlatform, { ...options, project: projectId });
        } else {
          throw e;
        }
      }
    }

    let outputPath = options.out;

    const fileInfo = getAppConfigFile(sdkConfig, detectedPlatform);
    let relativePath = "";
    outputPath = outputPath || (await getSdkOutputPath(appDir, detectedPlatform, options));
    const outputDir = path.dirname(outputPath);
    fs.mkdirpSync(outputDir);
    relativePath = path.relative(appDir, outputPath);
    const written = await writeConfigToFile(
      outputPath,
      options.nonInteractive,
      fileInfo.fileContents,
    );

    if (written) {
      logger.info(`App configuration is written in ${relativePath}`);
    }
    logUse(detectedPlatform, relativePath);

    return sdkConfig;
  });
