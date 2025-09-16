"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUpDataConnectTemplate = void 0;
const fs = require("fs-extra");
const path = require("path");
const ora = require("ora");
const command_1 = require("../../../src/command");
const apps_1 = require("../../../src/management/apps");
const projects_1 = require("../../../src/management/projects");
const error_1 = require("../../../src/error");
const logger_1 = require("../../../src/logger");
const util_1 = require("util");
const cmd = new command_1.Command("dataconnect:template:nextjs");
cmd.description('Template for creating NextJS Data Connect apps.');
async function resolveOptions() {
    const options = { cwd: process.cwd() };
    await cmd.prepare(options);
    return options;
}
const { values } = (0, util_1.parseArgs)({
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
    const project = await (0, projects_1.getOrPromptProject)(options);
    let sdkConfig = null;
    options.projectId = project.projectId;
    while (!sdkConfig) {
        try {
            sdkConfig = await (0, apps_1.getSdkConfig)(options, apps_1.AppPlatform.WEB);
        }
        catch (e) {
            if (e instanceof error_1.FirebaseError) {
                if (e.message.includes("associated with this Firebase project")) {
                    const webOptions = Object.assign(Object.assign({}, options), { project: project.projectId, nonInteractive: true, displayName: "CLI Web App" });
                    sdkConfig = await (0, apps_1.sdkInit)(apps_1.AppPlatform.WEB, webOptions);
                }
            }
            else {
                logger_1.logger.error("Failed to get sdkConfiguration: " + e);
                throw e;
            }
        }
    }
    return { project, sdkConfig };
}
async function setUpDataConnectTemplate() {
    const { sdkConfig } = await getProjectInfo();
    const webAppDir = path.resolve(__dirname, "../../templates/dataconnect/nextjs");
    const outputPath = path.resolve(process.cwd(), values.name || 'web-app');
    const spinner = ora({
        text: 'Initializing Data Connect Template',
    });
    fs.copySync(webAppDir, outputPath);
    const initFilePath = path.resolve(outputPath, "src/firebase/init.ts");
    const fileContents = fs.readFileSync(initFilePath, "utf8");
    const newOutput = fileContents.replace("/* Replace with sdkConfig */", JSON.stringify(sdkConfig, null, 2));
    fs.writeFileSync(initFilePath, newOutput);
    spinner.succeed();
    logger_1.logger.info(`Please run:
$ cd web-app
$ npm install`);
}
exports.setUpDataConnectTemplate = setUpDataConnectTemplate;
