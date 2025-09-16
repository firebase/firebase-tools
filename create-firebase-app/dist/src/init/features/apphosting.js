"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertAppHostingConfig = exports.doSetup = void 0;
const clc = require("colorette");
const fs_1 = require("fs");
const ora = require("ora");
const path = require("path");
const app_1 = require("../../apphosting/app");
const backend_1 = require("../../apphosting/backend");
const error_1 = require("../../error");
const apphosting_1 = require("../../gcp/apphosting");
const cloudbilling_1 = require("../../gcp/cloudbilling");
const prompt_1 = require("../../prompt");
const templates_1 = require("../../templates");
const utils = require("../../utils");
const utils_1 = require("../../utils");
const APPHOSTING_YAML_TEMPLATE = (0, templates_1.readTemplateSync)("init/apphosting/apphosting.yaml");
/**
 * Set up an apphosting.yaml file for a new App Hosting project.
 */
async function doSetup(setup, config) {
    const projectId = setup.projectId;
    if (!(await (0, cloudbilling_1.isBillingEnabled)(setup))) {
        throw new error_1.FirebaseError(`Firebase App Hosting requires billing to be enabled on your project. To upgrade, visit the following URL: https://console.firebase.google.com/project/${projectId}/usage/details`);
    }
    await (0, apphosting_1.ensureApiEnabled)({ projectId });
    await (0, backend_1.ensureRequiredApisEnabled)(projectId);
    // N.B. Deploying a backend from source requires the App Hosting compute service
    // account to have the storage.objectViewer IAM role.
    //
    // We don't want to update the IAM permissions right before attempting to deploy,
    // since IAM propagation delay will likely cause the first one to fail. However,
    // `firebase init apphosting` is a prerequisite to the `firebase deploy` command,
    // so we check and add the role here to give the IAM changes time to propagate.
    await (0, backend_1.ensureAppHostingComputeServiceAccount)(projectId, /* serviceAccount= */ "");
    utils.logBullet("This command links your local project to Firebase App Hosting. You will be able to deploy your web app with `firebase deploy` after setup.");
    const backendConfig = {
        backendId: "",
        rootDir: "",
        ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", "functions"],
    };
    const createOrLink = await (0, prompt_1.select)({
        default: "Create a new backend",
        message: "Please select an option",
        choices: [
            { name: "Create a new backend", value: "create" },
            { name: "Link to an existing backend", value: "link" },
        ],
    });
    if (createOrLink === "link") {
        backendConfig.backendId = await (0, backend_1.promptExistingBackend)(projectId, "Which backend would you like to link?");
    }
    else {
        (0, utils_1.logBullet)(`${clc.yellow("===")} Set up your backend`);
        const location = await (0, backend_1.promptLocation)(projectId, "Select a primary region to host your backend:\n");
        const backendId = await (0, backend_1.promptNewBackendId)(projectId, location);
        utils.logSuccess(`Name set to ${backendId}\n`);
        backendConfig.backendId = backendId;
        const webApp = await app_1.webApps.getOrCreateWebApp(projectId, 
        /* firebaseWebAppId= */ null, backendId);
        if (!webApp) {
            utils.logWarning(`Firebase web app not set`);
        }
        const createBackendSpinner = ora("Creating your new backend...").start();
        const backend = await (0, backend_1.createBackend)(projectId, location, backendId, 
        /* serviceAccount= */ null, 
        /* repository= */ undefined, webApp === null || webApp === void 0 ? void 0 : webApp.id);
        createBackendSpinner.succeed(`Successfully created backend!\n\t${backend.name}\n`);
    }
    (0, utils_1.logBullet)(`${clc.yellow("===")} Deploy local source setup`);
    backendConfig.rootDir = await (0, prompt_1.input)({
        default: "/",
        message: "Specify your app's root directory relative to your firebase.json directory",
    });
    upsertAppHostingConfig(backendConfig, config);
    config.writeProjectFile("firebase.json", config.src);
    utils.logBullet("Writing default settings to " + clc.bold("apphosting.yaml") + "...");
    const absRootDir = path.join(process.cwd(), backendConfig.rootDir);
    if (!(0, fs_1.existsSync)(absRootDir)) {
        throw new error_1.FirebaseError(`Failed to write apphosting.yaml file because app root directory ${absRootDir} does not exist. Please try again with a valid directory.`);
    }
    await config.askWriteProjectFile(path.join(absRootDir, "apphosting.yaml"), APPHOSTING_YAML_TEMPLATE);
    utils.logSuccess("Firebase initialization complete!");
}
exports.doSetup = doSetup;
/** Exported for unit testing. */
function upsertAppHostingConfig(backendConfig, config) {
    if (!config.src.apphosting) {
        config.set("apphosting", backendConfig);
        return;
    }
    if (Array.isArray(config.src.apphosting)) {
        config.set("apphosting", [...config.src.apphosting, backendConfig]);
        return;
    }
    config.set("apphosting", [config.src.apphosting, backendConfig]);
}
exports.upsertAppHostingConfig = upsertAppHostingConfig;
