"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addSdkGenerateToConnectorYaml = exports.actuate = exports.askQuestions = exports.FDC_SDK_PLATFORM_ENV = exports.FDC_SDK_FRAMEWORKS_ENV = exports.FDC_APP_FOLDER = void 0;
const yaml = __importStar(require("yaml"));
const clc = __importStar(require("colorette"));
const path = __importStar(require("path"));
const cwd = process.cwd();
const prompt_1 = require("../../../prompt");
const appFinder_1 = require("../../../dataconnect/appFinder");
const load_1 = require("../../../dataconnect/load");
const types_1 = require("../../../dataconnect/types");
const error_1 = require("../../../error");
const lodash_1 = require("lodash");
const utils_1 = require("../../../utils");
const dataconnectEmulator_1 = require("../../../emulator/dataconnectEmulator");
const auth_1 = require("../../../auth");
const create_app_1 = require("./create_app");
const track_1 = require("../../../track");
const fsutils_1 = require("../../../fsutils");
exports.FDC_APP_FOLDER = "FDC_APP_FOLDER";
exports.FDC_SDK_FRAMEWORKS_ENV = "FDC_SDK_FRAMEWORKS";
exports.FDC_SDK_PLATFORM_ENV = "FDC_SDK_PLATFORM";
async function askQuestions(setup) {
    const info = {
        apps: [],
    };
    info.apps = await chooseApp();
    if (!info.apps.length) {
        const npxMissingWarning = (0, utils_1.commandExistsSync)("npx")
            ? ""
            : clc.yellow(" (you need to install Node.js first)");
        const flutterMissingWarning = (0, utils_1.commandExistsSync)("flutter")
            ? ""
            : clc.yellow(" (you need to install Flutter first)");
        const choice = await (0, prompt_1.select)({
            message: `Do you want to create an app template?`,
            choices: [
                // TODO: Create template tailored to FDC for React.
                { name: `React${npxMissingWarning}`, value: "react" },
                { name: `Next.JS${npxMissingWarning}`, value: "next" },
                { name: `Flutter${flutterMissingWarning}`, value: "flutter" },
                { name: "no", value: "no" },
            ],
        });
        switch (choice) {
            case "react":
                await (0, create_app_1.createReactApp)((0, utils_1.newUniqueId)("web-app", (0, fsutils_1.listFiles)(cwd)));
                break;
            case "next":
                await (0, create_app_1.createNextApp)((0, utils_1.newUniqueId)("web-app", (0, fsutils_1.listFiles)(cwd)));
                break;
            case "flutter":
                await (0, create_app_1.createFlutterApp)((0, utils_1.newUniqueId)("flutter_app", (0, fsutils_1.listFiles)(cwd)));
                break;
            case "no":
                break;
        }
    }
    setup.featureInfo = setup.featureInfo || {};
    setup.featureInfo.dataconnectSdk = info;
}
exports.askQuestions = askQuestions;
async function chooseApp() {
    let apps = await (0, appFinder_1.detectApps)(cwd);
    if (apps.length) {
        (0, utils_1.logLabeledSuccess)("dataconnect", `Detected existing apps ${apps.map((a) => (0, appFinder_1.appDescription)(a)).join(", ")}`);
    }
    else {
        (0, utils_1.logLabeledWarning)("dataconnect", "No app exists in the current directory.");
    }
    // Check for environment variables override.
    const envAppFolder = (0, utils_1.envOverride)(exports.FDC_APP_FOLDER, "");
    const envPlatform = (0, utils_1.envOverride)(exports.FDC_SDK_PLATFORM_ENV, types_1.Platform.NONE);
    const envFrameworks = (0, utils_1.envOverride)(exports.FDC_SDK_FRAMEWORKS_ENV, "")
        .split(",")
        .map((f) => f);
    if (envAppFolder && envPlatform !== types_1.Platform.NONE) {
        // Resolve the relative path to the app directory
        const envAppRelDir = path.relative(cwd, path.resolve(cwd, envAppFolder));
        const matchedApps = apps.filter((app) => app.directory === envAppRelDir && (!app.platform || app.platform === envPlatform));
        if (matchedApps.length) {
            for (const a of matchedApps) {
                a.frameworks = [...(a.frameworks || []), ...envFrameworks];
            }
            return matchedApps;
        }
        return [
            {
                platform: envPlatform,
                directory: envAppRelDir,
                frameworks: envFrameworks,
            },
        ];
    }
    if (apps.length >= 2) {
        const choices = apps.map((a) => {
            return {
                name: (0, appFinder_1.appDescription)(a),
                value: a,
                checked: a.directory === ".",
            };
        });
        const pickedApps = await (0, prompt_1.checkbox)({
            message: "Which apps do you want to set up Data Connect SDKs in?",
            choices,
        });
        if (!pickedApps.length) {
            throw new error_1.FirebaseError("Command Aborted. Please choose at least one app.");
        }
        apps = pickedApps;
    }
    return apps;
}
async function actuate(setup, config) {
    const fdcInfo = setup.featureInfo?.dataconnect;
    const sdkInfo = setup.featureInfo?.dataconnectSdk;
    if (!sdkInfo) {
        throw new Error("Data Connect SDK feature RequiredInfo is not provided");
    }
    try {
        await actuateWithInfo(setup, config, sdkInfo);
    }
    finally {
        let flow = "no_app";
        if (sdkInfo.apps.length) {
            const platforms = sdkInfo.apps.map((a) => a.platform.toLowerCase()).sort();
            flow = `${platforms.join("_")}_app`;
        }
        if (fdcInfo) {
            fdcInfo.analyticsFlow += `_${flow}`;
        }
        else {
            void (0, track_1.trackGA4)("dataconnect_init", {
                project_status: setup.projectId ? (setup.isBillingEnabled ? "blaze" : "spark") : "missing",
                flow: `cli_sdk_${flow}`,
            });
        }
    }
}
exports.actuate = actuate;
async function actuateWithInfo(setup, config, info) {
    if (!info.apps.length) {
        // If no apps is specified, try to detect it again.
        // In `firebase init dataconnect:sdk`, customer may create the app while the command is running.
        // The `firebase_init` MCP tool always pass an empty `apps` list, it should setup all apps detected.
        info.apps = await (0, appFinder_1.detectApps)(cwd);
        if (!info.apps.length) {
            (0, utils_1.logLabeledBullet)("dataconnect", "No apps to setup Data Connect Generated SDKs");
            return;
        }
    }
    const apps = info.apps;
    const connectorInfo = await chooseExistingConnector(setup, config);
    const connectorYaml = JSON.parse(JSON.stringify(connectorInfo.connectorYaml));
    for (const app of apps) {
        if (!(0, fsutils_1.dirExistsSync)(app.directory)) {
            (0, utils_1.logLabeledWarning)("dataconnect", `App directory ${app.directory} does not exist`);
        }
        addSdkGenerateToConnectorYaml(connectorInfo, connectorYaml, app);
    }
    // TODO: Prompt user about adding generated paths to .gitignore
    const connectorYamlContents = yaml.stringify(connectorYaml);
    connectorInfo.connectorYaml = connectorYaml;
    const connectorYamlPath = `${connectorInfo.directory}/connector.yaml`;
    config.writeProjectFile(path.relative(config.projectDir, connectorYamlPath), connectorYamlContents);
    (0, utils_1.logLabeledBullet)("dataconnect", `Installing the generated SDKs ...`);
    const account = (0, auth_1.getGlobalDefaultAccount)();
    try {
        await dataconnectEmulator_1.DataConnectEmulator.generate({
            configDir: connectorInfo.directory,
            account,
        });
    }
    catch (e) {
        (0, utils_1.logLabeledError)("dataconnect", `Failed to generate Data Connect SDKs\n${e?.message}`);
    }
    (0, utils_1.logLabeledSuccess)("dataconnect", `Installed generated SDKs for ${clc.bold(apps.map((a) => (0, appFinder_1.appDescription)(a)).join(", "))}`);
    if (apps.some((a) => a.platform === types_1.Platform.IOS)) {
        (0, utils_1.logBullet)(clc.bold("Please follow the instructions here to add your generated sdk to your XCode project:\n\thttps://firebase.google.com/docs/data-connect/ios-sdk#set-client"));
    }
    if (apps.some((a) => a.frameworks?.includes("react"))) {
        (0, utils_1.logBullet)("Visit https://firebase.google.com/docs/data-connect/web-sdk#react for more information on how to set up React Generated SDKs for Firebase Data Connect");
    }
    if (apps.some((a) => a.frameworks?.includes("angular"))) {
        (0, utils_1.logBullet)("Run `ng add @angular/fire` to install angular sdk dependencies.\nVisit https://github.com/invertase/tanstack-query-firebase/tree/main/packages/angular for more information on how to set up Angular Generated SDKs for Firebase Data Connect");
    }
}
/**
 * Picks an existing connector from those present in the local workspace.
 *
 * Firebase Console can provide `FDC_CONNECTOR` environment variable.
 * If its is present, chooseExistingConnector try to match it with any existing connectors
 * and short-circuit the prompt.
 *
 * `FDC_CONNECTOR` should have the same `<location>/<serviceId>/<connectorId>`.
 * @param choices
 */
async function chooseExistingConnector(setup, config) {
    const serviceInfos = await (0, load_1.loadAll)(setup.projectId || "", config);
    const choices = serviceInfos
        .map((si) => {
        return si.connectorInfo.map((ci) => {
            return {
                name: `${si.dataConnectYaml.location}/${si.dataConnectYaml.serviceId}/${ci.connectorYaml.connectorId}`,
                value: ci,
            };
        });
    })
        .flat();
    if (!choices.length) {
        throw new error_1.FirebaseError(`No Firebase Data Connect workspace found. Run ${clc.bold("firebase init dataconnect")} to set up a service and connector.`);
    }
    if (choices.length === 1) {
        // Only one connector available, use it.
        return choices[0].value;
    }
    const connectorEnvVar = (0, utils_1.envOverride)("FDC_CONNECTOR", "");
    if (connectorEnvVar) {
        const existingConnector = choices.find((c) => c.name === connectorEnvVar);
        if (existingConnector) {
            (0, utils_1.logBullet)(`Picking up the existing connector ${clc.bold(connectorEnvVar)}.`);
            return existingConnector.value;
        }
        (0, utils_1.logWarning)(`Unable to pick up an existing connector based on FDC_CONNECTOR=${connectorEnvVar}.`);
    }
    (0, utils_1.logWarning)(`Pick up the first connector ${clc.bold(connectorEnvVar)}. Use FDC_CONNECTOR to override it`);
    return choices[0].value;
}
/** add SDK generation configuration to connector.yaml in place */
function addSdkGenerateToConnectorYaml(connectorInfo, connectorYaml, app) {
    const connectorDir = connectorInfo.directory;
    const appDir = app.directory;
    if (!connectorYaml.generate) {
        connectorYaml.generate = {};
    }
    const generate = connectorYaml.generate;
    switch (app.platform) {
        case types_1.Platform.WEB: {
            const javascriptSdk = {
                outputDir: path.relative(connectorDir, path.join(appDir, `src/dataconnect-generated`)),
                package: `@dataconnect/generated`,
                packageJsonDir: path.relative(connectorDir, appDir),
                react: false,
                angular: false,
            };
            for (const f of app.frameworks || []) {
                javascriptSdk[f] = true;
            }
            if (!(0, lodash_1.isArray)(generate?.javascriptSdk)) {
                generate.javascriptSdk = generate.javascriptSdk ? [generate.javascriptSdk] : [];
            }
            if (!generate.javascriptSdk.some((s) => s.outputDir === javascriptSdk.outputDir)) {
                generate.javascriptSdk.push(javascriptSdk);
            }
            break;
        }
        case types_1.Platform.FLUTTER: {
            const dartSdk = {
                outputDir: path.relative(connectorDir, path.join(appDir, `lib/dataconnect_generated`)),
                package: "dataconnect_generated",
            };
            if (!(0, lodash_1.isArray)(generate?.dartSdk)) {
                generate.dartSdk = generate.dartSdk ? [generate.dartSdk] : [];
            }
            if (!generate.dartSdk.some((s) => s.outputDir === dartSdk.outputDir)) {
                generate.dartSdk.push(dartSdk);
            }
            break;
        }
        case types_1.Platform.ANDROID: {
            const kotlinSdk = {
                outputDir: path.relative(connectorDir, path.join(appDir, `src/main/kotlin`)),
                package: `com.google.firebase.dataconnect.generated`,
            };
            if (!(0, lodash_1.isArray)(generate?.kotlinSdk)) {
                generate.kotlinSdk = generate.kotlinSdk ? [generate.kotlinSdk] : [];
            }
            if (!generate.kotlinSdk.some((s) => s.outputDir === kotlinSdk.outputDir)) {
                generate.kotlinSdk.push(kotlinSdk);
            }
            break;
        }
        case types_1.Platform.IOS: {
            const swiftSdk = {
                outputDir: path.relative(connectorDir, path.join(app.directory, `../FirebaseDataConnectGenerated`)),
                package: "DataConnectGenerated",
            };
            if (!(0, lodash_1.isArray)(generate?.swiftSdk)) {
                generate.swiftSdk = generate.swiftSdk ? [generate.swiftSdk] : [];
            }
            if (!generate.swiftSdk.some((s) => s.outputDir === swiftSdk.outputDir)) {
                generate.swiftSdk.push(swiftSdk);
            }
            break;
        }
        default:
            throw new error_1.FirebaseError(`Unsupported platform ${app.platform} for Data Connect SDK generation. Supported platforms are: ${Object.values(types_1.Platform)
                .filter((p) => p !== types_1.Platform.NONE && p !== types_1.Platform.MULTIPLE)
                .join(", ")}\n${JSON.stringify(app)}`);
    }
}
exports.addSdkGenerateToConnectorYaml = addSdkGenerateToConnectorYaml;
//# sourceMappingURL=sdk.js.map