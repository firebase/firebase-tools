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

export interface AppsSdkConfigOptions extends Options {
  out?: string | boolean;
}

function logUse(platform: AppPlatform, filePath: string) {
  switch (platform) {
    case AppPlatform.WEB:
      console.log(`
        How to use your JS SDK Config:
        ES Module:
        import { initializeApp } from 'firebase/app';
        import json from './${filePath || "firebase-sdk-config.json"}';
        initializeApp(json);
        // CommonJS Module:
        const { initializeApp } = require('firebase/app');
        const json = require('./firebase-js-config.json');
        initializeApp(json);// instead of initializeApp(config);
      `);
    case AppPlatform.ANDROID:
      console.log(`
        Visit https://firebase.google.com/docs/android/setup#add-config-file 
        for information on editing your gradle file and adding Firebase SDKs to your app.
      `);
    case AppPlatform.IOS:
      console.log(`
        Visit https://firebase.google.com/docs/ios/setup#add-config-file 
        for information on adding the config file to your targets and adding Firebase SDKs to your app.
      `);
  }
}

export const command = new Command("apps:configure")
  .description("Automatically download and create config of a Firebase app. ")
  .before(requireAuth)
  .action(async (options: AppsSdkConfigOptions): Promise<AppConfig> => {
    const config = options.config;
    const appDir = process.cwd();
    // auto-detect the platform
    const platform = await getPlatform(appDir, config);

    let sdkConfig: AppConfig | undefined;
    while (sdkConfig === undefined) {
      try {
        sdkConfig = await getSdkConfig(options, getAppPlatform(platform));
      } catch (e) {
        if ((e as Error).message.includes("associated with this Firebase project")) {
          const projectId = needProjectId(options);
          await sdkInit(platform, { ...options, project: projectId });
        } else {
          throw e;
        }
      }
    }

    let writeToFile = true; // We should write to the config file by default.
    let outputPath: string = "";
    if (typeof options.out === "boolean" && !options.out) {
      writeToFile = options.out;
    } else if (typeof options.out === "string") {
      writeToFile = true;
      outputPath = options.out;
    }

    let relativePath: string = "";
    if (writeToFile) {
      outputPath = outputPath || (await getSdkOutputPath(appDir, platform, options));
      const outputDir = path.dirname(outputPath!);
      fs.mkdirpSync(outputDir);
      relativePath = path.relative(appDir, outputPath);
      const fileInfo = getAppConfigFile(sdkConfig, platform);
      await writeConfigToFile(outputPath!, options.nonInteractive, fileInfo.fileContents);

      logger.info(`App configuration is written in ${relativePath}`);
    }
    logUse(platform, relativePath);

    return sdkConfig;
  });
