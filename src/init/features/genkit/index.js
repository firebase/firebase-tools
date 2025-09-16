"use strict";
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
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
exports.promptWriteMode = exports.isPackageJson = exports.isTsConfig = exports.genkitSetup = exports.ensureVertexApiEnabled = exports.doSetup = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
const clc = __importStar(require("colorette"));
const functions_1 = require("../functions");
const prompt_1 = require("../../../prompt");
const spawn_1 = require("../../spawn");
const projectUtils_1 = require("../../../projectUtils");
const ensureApiEnabled_1 = require("../../../ensureApiEnabled");
const logger_1 = require("../../../logger");
const error_1 = require("../../../error");
const utils_1 = require("../../../utils");
// This is the next breaking change version past the latest template.
const UNKNOWN_VERSION_TOO_HIGH = "2.0.0";
const MIN_VERSION = "0.6.0";
// This is the latest template. It is the default.
const LATEST_TEMPLATE = "1.0.0";
async function getPackageVersion(packageName, envVariable) {
    // Allow the installed version to be set for dev purposes.
    const envVal = process.env[envVariable];
    if (envVal && typeof envVal === "string") {
        if (semver.parse(envVal)) {
            return envVal;
        }
        else {
            throw new error_1.FirebaseError(`Invalid version string '${envVal}' specified in ${envVariable}`);
        }
    }
    try {
        const output = await (0, spawn_1.spawnWithOutput)("npm", ["view", packageName, "version"]);
        if (!output) {
            throw new error_1.FirebaseError(`Unable to determine ${packageName} version to install`);
        }
        return output;
    }
    catch (err) {
        throw new error_1.FirebaseError(`Unable to determine which version of ${packageName} to install.\n` +
            `npm Error: ${(0, error_1.getErrMsg)(err)}\n\n` +
            "For a possible workaround run\n  npm view " +
            packageName +
            " version\n" +
            "and then set an environment variable:\n" +
            `  export ${envVariable}=<output from previous command>\n` +
            "and run `firebase init genkit` again");
    }
}
/**
 * Determines which version and template to install
 * @return a GenkitInfo object
 */
async function getGenkitInfo() {
    let templateVersion = LATEST_TEMPLATE;
    let stopInstall = false;
    const genkitVersion = await getPackageVersion("genkit", "GENKIT_DEV_VERSION");
    const cliVersion = await getPackageVersion("genkit-cli", "GENKIT_CLI_DEV_VERSION");
    const vertexVersion = await getPackageVersion("@genkit-ai/vertexai", "GENKIT_VERTEX_VERSION");
    const googleAiVersion = await getPackageVersion("@genkit-ai/googleai", "GENKIT_GOOGLEAI_VERSION");
    if (semver.gte(genkitVersion, UNKNOWN_VERSION_TOO_HIGH)) {
        // We don't know about this version. (Can override with GENKIT_DEV_VERSION)
        const continueInstall = await (0, prompt_1.confirm)({
            message: clc.yellow(`WARNING: The latest version of Genkit (${genkitVersion}) isn't supported by this\n` +
                "version of firebase-tools. You can proceed, but the provided sample code may\n" +
                "not work with the latest library. You can also try updating firebase-tools with\n" +
                "npm install -g firebase-tools@latest, and then running this command again.\n\n") + "Proceed with installing the latest version of Genkit?",
            default: false,
        });
        if (!continueInstall) {
            stopInstall = true;
        }
    }
    else if (semver.gte(genkitVersion, "1.0.0-rc.1")) {
        // 1.0.0-rc.1 < 1.0.0
        templateVersion = "1.0.0";
    }
    else if (semver.gte(genkitVersion, MIN_VERSION)) {
        templateVersion = "0.9.0";
    }
    else {
        throw new error_1.FirebaseError(`The requested version of Genkit (${genkitVersion}) is no ` +
            `longer supported. Please specify a newer version.`);
    }
    return {
        genkitVersion,
        cliVersion,
        vertexVersion,
        googleAiVersion,
        templateVersion,
        stopInstall,
    };
}
function showStartMessage(setup, command) {
    logger_1.logger.info();
    logger_1.logger.info("\nLogin to Google Cloud using:");
    logger_1.logger.info(clc.bold(clc.green(`    gcloud auth application-default login --project ${setup.projectId || "your-project-id"}\n`)));
    logger_1.logger.info("Then start the Genkit developer experience by running:");
    logger_1.logger.info(clc.bold(clc.green(`    ${command}`)));
}
/**
 * doSetup is the entry point for setting up the genkit suite.
 */
async function doSetup(initSetup, config, options) {
    const setup = initSetup;
    const genkitInfo = await getGenkitInfo();
    if (genkitInfo.stopInstall) {
        (0, utils_1.logLabeledWarning)("genkit", "Stopped Genkit initialization");
        return;
    }
    if (setup.functions?.languageChoice !== "typescript") {
        const continueFunctions = await (0, prompt_1.confirm)({
            message: "Genkit's Firebase integration uses Cloud Functions for Firebase with TypeScript.\nInitialize Functions to continue?",
            default: true,
        });
        if (!continueFunctions) {
            (0, utils_1.logLabeledWarning)("genkit", "Stopped Genkit initialization");
            return;
        }
        // Functions with genkit should always be typescript
        setup.languageOverride = "typescript";
        await (0, functions_1.doSetup)(setup, config, options);
        delete setup.languageOverride;
        logger_1.logger.info();
    }
    if (!setup.functions) {
        throw new error_1.FirebaseError("Failed to initialize Genkit prerequisite: Firebase functions");
    }
    const projectDir = `${config.projectDir}/${setup.functions.source}`;
    const installType = await (0, prompt_1.select)({
        message: "Install the Genkit CLI globally or locally in this project?",
        choices: [
            { name: "Globally", value: "globally" },
            { name: "Just this project", value: "project" },
        ],
    });
    try {
        (0, utils_1.logLabeledBullet)("genkit", `Installing Genkit CLI version ${genkitInfo.cliVersion}`);
        if (installType === "globally") {
            await (0, spawn_1.wrapSpawn)("npm", ["install", "-g", `genkit-cli@${genkitInfo.cliVersion}`], projectDir);
            await genkitSetup(options, genkitInfo, projectDir);
            showStartMessage(setup, `cd ${setup.functions.source} && npm run genkit:start`);
        }
        else {
            await (0, spawn_1.wrapSpawn)("npm", ["install", `genkit-cli@${genkitInfo.cliVersion}`, "--save-dev"], projectDir);
            await genkitSetup(options, genkitInfo, projectDir);
            showStartMessage(setup, `cd ${setup.functions.source} && npm run genkit:start`);
        }
    }
    catch (err) {
        (0, utils_1.logLabeledError)("genkit", `Genkit initialization failed: ${(0, error_1.getErrMsg)(err)}`);
        return;
    }
}
exports.doSetup = doSetup;
/**
 * Enables the Vertex AI API on a best effort basis.
 * @param options The options passed to the parent command
 */
async function ensureVertexApiEnabled(options) {
    const VERTEX_AI_URL = "https://aiplatform.googleapis.com";
    const projectId = (0, projectUtils_1.getProjectId)(options);
    if (!projectId) {
        return;
    }
    // If using markdown, enable it silently
    const silently = typeof options.markdown === "boolean" && options.markdown;
    return await (0, ensureApiEnabled_1.ensure)(projectId, VERTEX_AI_URL, "aiplatform", silently);
}
exports.ensureVertexApiEnabled = ensureVertexApiEnabled;
/** Model to plugin name. */
function getModelOptions(genkitInfo) {
    const modelOptions = {
        vertexai: {
            label: "Google Cloud Vertex AI",
            plugin: "@genkit-ai/vertexai",
            package: `@genkit-ai/vertexai@${genkitInfo.vertexVersion}`,
        },
        googleai: {
            label: "Google AI",
            plugin: "@genkit-ai/googleai",
            package: `@genkit-ai/googleai@${genkitInfo.googleAiVersion}`,
        },
        none: { label: "None", plugin: undefined, package: undefined },
    };
    return modelOptions;
}
/** Plugin name to descriptor. */
const pluginToInfo = {
    "@genkit-ai/firebase": {
        imports: "firebase",
        init: `
    // Load the Firebase plugin, which provides integrations with several
    // Firebase services.
    firebase()`.trimStart(),
    },
    "@genkit-ai/vertexai": {
        imports: "vertexAI",
        modelImportComment: `
// Import models from the Vertex AI plugin. The Vertex AI API provides access to
// several generative models. Here, we import Gemini 2.0 Flash.`.trimStart(),
        init: `
    // Load the Vertex AI plugin. You can optionally specify your project ID
    // by passing in a config object; if you don't, the Vertex AI plugin uses
    // the value from the GCLOUD_PROJECT environment variable.
    vertexAI({location: "us-central1"})`.trimStart(),
        model: "gemini20Flash",
    },
    "@genkit-ai/googleai": {
        imports: "googleAI",
        modelImportComment: `
// Import models from the Google AI plugin. The Google AI API provides access to
// several generative models. Here, we import Gemini 2.0 Flash.`.trimStart(),
        init: `
    // Load the Google AI plugin. You can optionally specify your API key
    // by passing in a config object; if you don't, the Google AI plugin uses
    // the value from the GOOGLE_GENAI_API_KEY environment variable, which is
    // the recommended practice.
    googleAI()`.trimStart(),
        model: "gemini20Flash",
    },
};
/** Basic packages required to use Genkit. */
function getBasePackages(genkitVersion) {
    const basePackages = ["express", `genkit@${genkitVersion}`];
    return basePackages;
}
/** External dev packages required to use Genkit. */
const externalDevPackages = ["typescript", "tsx"];
/**
 * Initializes a Genkit Node.js project.
 * @param options command-line arguments
 * @param genkitInfo Information about which version of genkit we are installing
 * @param projectDir The project directory to install into.
 */
async function genkitSetup(options, genkitInfo, projectDir) {
    // Choose a model
    const modelOptions = getModelOptions(genkitInfo);
    const supportedModels = Object.keys(modelOptions);
    const model = await (0, prompt_1.select)({
        message: "Select a model provider:",
        choices: supportedModels.map((model) => ({
            name: modelOptions[model].label,
            value: model,
        })),
    });
    if (model === "vertexai") {
        await ensureVertexApiEnabled(options);
    }
    // Compile plugins list.
    const plugins = [];
    const pluginPackages = [];
    pluginPackages.push(`@genkit-ai/firebase@${genkitInfo.genkitVersion}`);
    if (modelOptions[model]?.plugin) {
        plugins.push(modelOptions[model].plugin || "");
    }
    if (modelOptions[model]?.package) {
        pluginPackages.push(modelOptions[model].package || "");
    }
    // Compile NPM packages list.
    const packages = [...getBasePackages(genkitInfo.genkitVersion)];
    packages.push(...pluginPackages);
    // Initialize and configure.
    await installNpmPackages(projectDir, packages, externalDevPackages);
    if (!fs.existsSync(path.join(projectDir, "src"))) {
        fs.mkdirSync(path.join(projectDir, "src"));
    }
    await updateTsConfig(options.nonInteractive || false, projectDir);
    await updatePackageJson(options.nonInteractive || false, projectDir);
    if (options.nonInteractive ||
        (await (0, prompt_1.confirm)({
            message: "Would you like to generate a sample flow?",
            default: true,
        }))) {
        logger_1.logger.info("Telemetry data can be used to monitor and gain insights into your AI features. There may be a cost associated with using this feature. See https://firebase.google.com/docs/genkit/observability/telemetry-collection.");
        const enableTelemetry = options.nonInteractive ||
            (await (0, prompt_1.confirm)({
                message: "Would like you to enable telemetry collection?",
                default: true,
            }));
        generateSampleFile(modelOptions[model].plugin, plugins, projectDir, genkitInfo.templateVersion, enableTelemetry);
    }
}
exports.genkitSetup = genkitSetup;
// A typeguard for the results of JSON.parse(<user defined file>);
const isTsConfig = (value) => {
    if (!(0, error_1.isObject)(value) || (value.compilerOptions && !(0, error_1.isObject)(value.compilerOptions))) {
        return false;
    }
    return true;
};
exports.isTsConfig = isTsConfig;
/**
 * Updates tsconfig.json with required flags for Genkit.
 * @param nonInteractive if we rae asking the user questions
 * @param projectDir the directory containing the tsconfig.json
 */
async function updateTsConfig(nonInteractive, projectDir) {
    const tsConfigPath = path.join(projectDir, "tsconfig.json");
    let existingTsConfig = undefined;
    if (fs.existsSync(tsConfigPath)) {
        const parsed = JSON.parse(fs.readFileSync(tsConfigPath, "utf-8"));
        if (!(0, exports.isTsConfig)(parsed)) {
            throw new error_1.FirebaseError("Unable to parse existing tsconfig.json");
        }
        existingTsConfig = parsed;
    }
    let choice = "overwrite";
    if (!nonInteractive && existingTsConfig) {
        choice = await promptWriteMode("Would you like to update your tsconfig.json with suggested settings?");
    }
    const tsConfig = {
        compileOnSave: true,
        include: ["src"],
        compilerOptions: {
            module: "commonjs",
            noImplicitReturns: true,
            outDir: "lib",
            sourceMap: true,
            strict: true,
            target: "es2017",
            skipLibCheck: true,
            esModuleInterop: true,
        },
    };
    (0, utils_1.logLabeledBullet)("genkit", "Updating tsconfig.json");
    let newTsConfig = {};
    switch (choice) {
        case "overwrite":
            newTsConfig = {
                ...existingTsConfig,
                ...tsConfig,
                compilerOptions: {
                    ...existingTsConfig?.compilerOptions,
                    ...tsConfig.compilerOptions,
                },
            };
            break;
        case "merge":
            newTsConfig = {
                ...tsConfig,
                ...existingTsConfig,
                compilerOptions: {
                    ...tsConfig.compilerOptions,
                    ...existingTsConfig?.compilerOptions,
                },
            };
            break;
        case "keep":
            (0, utils_1.logLabeledWarning)("genkit", "Skipped updating tsconfig.json");
            return;
    }
    try {
        fs.writeFileSync(tsConfigPath, JSON.stringify(newTsConfig, null, 2));
        (0, utils_1.logLabeledSuccess)("genkit", "Successfully updated tsconfig.json");
    }
    catch (err) {
        (0, utils_1.logLabeledError)("genkit", `Failed to update tsconfig.json: ${(0, error_1.getErrMsg)(err)}`);
        process.exit(1);
    }
}
/**
 * Installs and saves NPM packages to package.json.
 * @param projectDir The project directory.
 * @param packages List of NPM packages to install.
 * @param devPackages List of NPM dev packages to install.
 */
async function installNpmPackages(projectDir, packages, devPackages) {
    (0, utils_1.logLabeledBullet)("genkit", "Installing NPM packages for genkit");
    try {
        if (packages.length) {
            await (0, spawn_1.wrapSpawn)("npm", ["install", ...packages, "--save"], projectDir);
        }
        if (devPackages?.length) {
            await (0, spawn_1.wrapSpawn)("npm", ["install", ...devPackages, "--save-dev"], projectDir);
        }
        (0, utils_1.logLabeledSuccess)("genkit", "Successfully installed NPM packages");
    }
    catch (err) {
        (0, utils_1.logLabeledError)("genkit", `Failed to install NPM packages: ${(0, error_1.getErrMsg)(err)}`);
        process.exit(1);
    }
}
/**
 * Generates a sample index.ts file.
 * @param modelPlugin Model plugin name.
 * @param configPlugins config plugins.
 */
function generateSampleFile(modelPlugin, configPlugins, projectDir, templateVersion, enableTelemetry) {
    let modelImport = "";
    if (modelPlugin && pluginToInfo[modelPlugin].model) {
        const modelInfo = pluginToInfo[modelPlugin].model || "";
        modelImport = "\n" + generateImportStatement(modelInfo, modelPlugin) + "\n";
    }
    let modelImportComment = "";
    if (modelPlugin && pluginToInfo[modelPlugin].modelImportComment) {
        const comment = pluginToInfo[modelPlugin].modelImportComment || "";
        modelImportComment = `\n${comment}`;
    }
    const commentedModelImport = `${modelImportComment}${modelImport}`;
    const templatePath = path.join(__dirname, `../../../../templates/genkit/firebase.${templateVersion}.template`);
    const template = fs.readFileSync(templatePath, "utf8");
    const sample = renderConfig(configPlugins, template
        .replace("$GENKIT_MODEL_IMPORT\n", commentedModelImport)
        .replace("$GENKIT_MODEL", modelPlugin
        ? pluginToInfo[modelPlugin].model || pluginToInfo[modelPlugin].modelStr || ""
        : "'' /* TODO: Set a model. */"), enableTelemetry);
    (0, utils_1.logLabeledBullet)("genkit", "Generating sample file");
    try {
        const samplePath = "src/genkit-sample.ts";
        fs.writeFileSync(path.join(projectDir, samplePath), sample, "utf8");
        (0, utils_1.logLabeledSuccess)("genkit", `Successfully generated sample file (${samplePath})`);
    }
    catch (err) {
        (0, utils_1.logLabeledError)("genkit", `Failed to generate sample file: ${(0, error_1.getErrMsg)(err)}`);
        process.exit(1);
    }
}
// A typeguard for the results of JSON.parse(<potentially user defined file>);
const isPackageJson = (value) => {
    if (!(0, error_1.isObject)(value) || (value.scripts && !(0, error_1.isObject)(value.scripts))) {
        return false;
    }
    return true;
};
exports.isPackageJson = isPackageJson;
/**
 * Updates package.json with Genkit-expected fields.
 * @param nonInteractive a boolean that indicates if we are asking questions or not
 * @param projectDir The directory to find the package.json file in.
 */
async function updatePackageJson(nonInteractive, projectDir) {
    const packageJsonPath = path.join(projectDir, "package.json");
    // package.json should exist before reaching this point.
    if (!fs.existsSync(packageJsonPath)) {
        throw new error_1.FirebaseError("Failed to find package.json.");
    }
    const existingPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (!(0, exports.isPackageJson)(existingPackageJson)) {
        throw new error_1.FirebaseError("Unable to parse existing package.json file");
    }
    const choice = nonInteractive
        ? "overwrite"
        : await promptWriteMode("Would you like to update your package.json with suggested settings?");
    const packageJson = {
        main: "lib/index.js",
        scripts: {
            "genkit:start": "genkit start -- tsx --watch src/genkit-sample.ts",
        },
    };
    (0, utils_1.logLabeledBullet)("genkit", "Updating package.json");
    let newPackageJson = {};
    switch (choice) {
        case "overwrite":
            newPackageJson = {
                ...existingPackageJson,
                ...packageJson,
                scripts: {
                    ...existingPackageJson.scripts,
                    ...packageJson.scripts,
                },
            };
            break;
        case "merge":
            newPackageJson = {
                ...packageJson,
                ...existingPackageJson,
                // Main will always be overwritten to match tsconfig.
                main: packageJson.main,
                scripts: {
                    ...packageJson.scripts,
                    ...existingPackageJson.scripts,
                },
            };
            break;
        case "keep":
            (0, utils_1.logLabeledWarning)("genkit", "Skipped updating package.json");
            return;
    }
    try {
        fs.writeFileSync(packageJsonPath, JSON.stringify(newPackageJson, null, 2));
        (0, utils_1.logLabeledSuccess)("genkit", "Successfully updated package.json");
    }
    catch (err) {
        (0, utils_1.logLabeledError)("genkit", `Failed to update package.json: ${(0, error_1.getErrMsg)(err)}`);
        process.exit(1);
    }
}
function renderConfig(pluginNames, template, enableTelemetry) {
    const imports = pluginNames
        .map((pluginName) => generateImportStatement(pluginToInfo[pluginName].imports, pluginName))
        .join("\n");
    const plugins = pluginNames.map((pluginName) => `    ${pluginToInfo[pluginName].init},`).join("\n") ||
        "    /* Add your plugins here. */";
    return template
        .replace("$GENKIT_CONFIG_IMPORTS", imports)
        .replace("$GENKIT_CONFIG_PLUGINS", plugins)
        .replaceAll("$TELEMETRY_COMMENT", enableTelemetry ? "" : "// ");
}
function generateImportStatement(imports, name) {
    return `import {${imports}} from "${name}";`;
}
/**
 * Prompts for what type of write to perform when there is a conflict.
 * @param message The question to ask
 * @param defaultOption The default WriteMode to highlight
 * @return The writemode selected
 */
async function promptWriteMode(message, defaultOption = "merge") {
    return (0, prompt_1.select)({
        message,
        choices: [
            { name: "Set if unset", value: "merge" },
            { name: "Overwrite", value: "overwrite" },
            { name: "Keep unchanged", value: "keep" },
        ],
        default: defaultOption,
    });
}
exports.promptWriteMode = promptWriteMode;
//# sourceMappingURL=index.js.map