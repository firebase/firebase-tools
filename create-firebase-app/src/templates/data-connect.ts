import * as fs from "fs-extra";
import * as path from "path";
import * as ora from 'ora';
import { Command } from "../../../src/command";
import { Options } from "../../../src/options";
import { getOrPromptProject } from "../../../src/management/projects";
import { AppConfig, AppPlatform, getSdkConfig, sdkInit } from '../../../src/management/apps';
import { FirebaseError } from "../../../src/error";
// import { logger } from "../../../src/logger";

const cmd = new Command("dataconnect:template:nextjs");
cmd.description('Template for creating NextJS Data Connect apps.');

  async function resolveOptions() {
    const options: Partial<Options> = { cwd: process.cwd() };
    // await cmd.prepare(options);
    return options as Options;
  }


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
        console.error("Failed to get sdkConfiguration: " + e);
        throw e;
      }
    }
  }
  return { project, sdkConfig };
}

export async function setUpDataConnectTemplate() {
  const { sdkConfig } = await getProjectInfo();
  const webAppDir = path.resolve(__dirname, "../../../../templates/dataconnect/nextjs");
  // TODO: Replace this
  const outputPath = path.resolve(process.cwd(), 'web-app');
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
  console.log(`Please run:
$ cd web-app
$ npm install`);
return sdkConfig;
}
