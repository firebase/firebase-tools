#!/usr/bin/env node
import * as fs from "fs-extra";
import * as path from "path";
import * as ora from 'ora';
import { Command } from "../command";
import { AppConfig, AppPlatform, getSdkConfig, sdkInit } from "../management/apps";
import { getOrPromptProject } from "../management/projects";
import { Options } from "../options";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { parseArgs } from "util";

const cmd = new Command("dataconnect:template:nextjs");
cmd.description('Template for creating NextJS Data Connect apps.');

async function resolveOptions() {
  const options: Partial<Options> = { cwd: process.cwd() };
  await cmd.prepare(options);
  return options as Options;
}

const { values } = parseArgs({
    options: {
        name: {
            type: 'string',
            short: 'n',
            default: 'web-app'
        }
    },
    allowPositionals: true
});


async function getProjectInfo() {
  const options = await resolveOptions();
  const project = await getOrPromptProject(options);
  let sdkConfig: AppConfig | null = null;
  options.projectId = project.projectId;
  while (!sdkConfig) {
    try {
      sdkConfig = await getSdkConfig(options, AppPlatform.WEB);
    } catch (e) {
      if (e instanceof FirebaseError) {
        if (e.message.includes("associated with this Firebase project")) {
          const webOptions = {
            ...options,
            project: project.projectId,
            nonInteractive: true,
            displayName: "CLI Web App",
          };
          sdkConfig = await sdkInit(AppPlatform.WEB, webOptions);
        }
      } else {
        logger.error("Failed to get sdkConfiguration: " + e);
        throw e;
      }
    }
  }
  return { project, sdkConfig };
}

async function run() {
  const { sdkConfig } = await getProjectInfo();
  const webAppDir = path.resolve(__dirname, "../../templates/dataconnect/nextjs");
  const outputPath = path.resolve(process.cwd(), values.name || 'web-app');
  const spinner = ora({
    text: 'Initializing Data Connect Template',
  });
  fs.copySync(webAppDir, outputPath);
  const initFilePath = path.resolve(outputPath, "src/firebase/init.ts");
  const fileContents = fs.readFileSync(initFilePath, "utf8");
  const newOutput = fileContents.replace(
    "/* Replace with sdkConfig */",
    JSON.stringify(sdkConfig!, null, 2),
  );
  fs.writeFileSync(initFilePath, newOutput);
  spinner.succeed();
  logger.info(`Please run:
$ cd web-app
$ npm install`);
}

run();
