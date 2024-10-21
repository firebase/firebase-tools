import * as fs from "fs-extra";

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
import * as path from "path";

interface AppsSdkConfigOptions extends Options {
  out?: string | boolean;
}

export const command = new Command("apps:sdkconfig [platform] [appId]")
  .description(
    "print the Google Services config of a Firebase app. " +
      "[platform] can be IOS, ANDROID or WEB (case insensitive)",
  )
  .option("-o, --out [file]", "(optional) write config output to a file") // Note: There's a discrepency here: this expects a string, but below we check if `output` is a boolean
  .before(requireAuth)
  .action(
    async (
      platform: AppPlatform = AppPlatform.PLATFORM_UNSPECIFIED,
      appId = "",
      options: AppsSdkConfigOptions,
    ): Promise<AppConfig> => {
      let outputPath: string | undefined = options.out === true ? "" : (options.out as string);
      const skipWrite = options.out === false;
      const config = options.config;
      const appDir = process.cwd();
      if (!platform) {
        // Auto-detect platform based on current directory if not specified
        platform = await getPlatform(appDir, config);
      }

      let sdkConfig: AppConfig | undefined;
      while (sdkConfig === undefined) {
        try {
          sdkConfig = await getSdkConfig(options, getAppPlatform(platform), appId);
        } catch (e) {
          if ((e as Error).message.includes("associated with this Firebase project")) {
            await sdkInit(platform as unknown as AppPlatform, options);
          } else {
            throw e;
          }
        }
      }

      if (!skipWrite) {
        outputPath = getSdkOutputPath(appDir, platform);
        const outputDir = path.dirname(outputPath!);
        fs.mkdirpSync(outputDir);
        const fileInfo = getAppConfigFile(sdkConfig, platform);
        await writeConfigToFile(outputPath!, options.nonInteractive, fileInfo.fileContents);
        if (platform === AppPlatform.WEB) {
          logger.info(`
        How to use your JS SDK Config:
        ES Module:
        import { initializeApp } from 'firebase/app';
        import json from './firebase-js-config.json';
        initializeApp(json);
        // CommonJS Module:
        const { initializeApp } = require('firebase/app');
        const json = require('./firebase-js-config.json');
        initializeApp(json);// instead of initializeApp(config);
        `);
        }
        logger.info(`App configuration is written in ${fileInfo}`);
      }

      return sdkConfig;
    },
  );
