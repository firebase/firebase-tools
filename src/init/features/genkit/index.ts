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

import * as fs from "fs";
import * as path from "path";
import * as semver from "semver";
import * as clc from "colorette";

import { doSetup as functionsSetup } from "../functions";
import { Config } from "../../../config";
import { confirm, select } from "../../../prompt";
import { wrapSpawn, spawnWithOutput } from "../../spawn";
import { Options } from "../../../options";
import { getProjectId } from "../../../projectUtils";
import { ensure } from "../../../ensureApiEnabled";
import { logger } from "../../../logger";
import { FirebaseError, getErrMsg, isObject } from "../../../error";
import { Setup } from "../..";
import {
  logLabeledBullet,
  logLabeledError,
  logLabeledSuccess,
  logLabeledWarning,
} from "../../../utils";

interface GenkitInfo {
  genkitVersion: string;
  cliVersion: string;
  genaiVersion: string;
  vertexVersion: string;
  googleAiVersion: string;
  templateVersion: string;
  stopInstall: boolean;
}

// This is the next breaking change version past the latest template.
const UNKNOWN_VERSION_TOO_HIGH = "2.0.0";
const MIN_VERSION = "1.0.0-rc.1";
const UNIFIED_PLUGIN_VERSION = "1.18.0"; // also rename template if you change this

// This is the latest template. It is the default.
const LATEST_TEMPLATE = "1.0.0";

async function getPackageVersion(packageName: string, envVariable: string): Promise<string> {
  // Allow the installed version to be set for dev purposes.
  const envVal = process.env[envVariable];
  if (envVal && typeof envVal === "string") {
    if (semver.parse(envVal)) {
      return envVal;
    } else {
      throw new FirebaseError(`Invalid version string '${envVal}' specified in ${envVariable}`);
    }
  }
  try {
    const output = await spawnWithOutput("npm", ["view", packageName, "version"]);
    if (!output) {
      throw new FirebaseError(`Unable to determine ${packageName} version to install`);
    }
    return output;
  } catch (err: unknown) {
    throw new FirebaseError(
      `Unable to determine which version of ${packageName} to install.\n` +
        `npm Error: ${getErrMsg(err)}\n\n` +
        "For a possible workaround run\n  npm view " +
        packageName +
        " version\n" +
        "and then set an environment variable:\n" +
        `  export ${envVariable}=<output from previous command>\n` +
        "and run `firebase init genkit` again",
    );
  }
}

/**
 * Determines which version and template to install
 * @return a GenkitInfo object
 */
async function getGenkitInfo(): Promise<GenkitInfo> {
  let templateVersion = LATEST_TEMPLATE;
  let stopInstall = false;

  const genkitVersion = await getPackageVersion("genkit", "GENKIT_DEV_VERSION");
  const cliVersion = await getPackageVersion("genkit-cli", "GENKIT_CLI_DEV_VERSION");
  const genaiVersion = await getPackageVersion("@genkit-ai/google-genai", "GENKIT_GENAI_VERSION");
  const vertexVersion = await getPackageVersion("@genkit-ai/vertexai", "GENKIT_VERTEX_VERSION");
  const googleAiVersion = await getPackageVersion("@genkit-ai/googleai", "GENKIT_GOOGLEAI_VERSION");

  if (semver.gte(genkitVersion, UNKNOWN_VERSION_TOO_HIGH)) {
    // We don't know about this version. (Can override with GENKIT_DEV_VERSION)
    const continueInstall = await confirm({
      message:
        clc.yellow(
          `WARNING: The latest version of Genkit (${genkitVersion}) isn't supported by this\n` +
            "version of firebase-tools. You can proceed, but the provided sample code may\n" +
            "not work with the latest library. You can also try updating firebase-tools with\n" +
            "npm install -g firebase-tools@latest, and then running this command again.\n\n",
        ) + "Proceed with installing the latest version of Genkit?",
      default: false,
    });
    if (!continueInstall) {
      stopInstall = true;
    }
  } else if (
    semver.gte(genkitVersion, UNIFIED_PLUGIN_VERSION) &&
    semver.gte(genaiVersion, "0.0.2-rc.1")
  ) {
    // Unified plugin template
    templateVersion = UNIFIED_PLUGIN_VERSION;
  } else if (semver.gte(genkitVersion, MIN_VERSION)) {
    templateVersion = "1.0.0";
  } else {
    throw new FirebaseError(
      `The requested version of Genkit (${genkitVersion}) is no ` +
        `longer supported. Please specify a newer version.`,
    );
  }

  return {
    genkitVersion,
    cliVersion,
    vertexVersion,
    googleAiVersion,
    genaiVersion,
    templateVersion,
    stopInstall,
  };
}

/**
 * GenkitSetup depends on functions setup.
 */
export interface GenkitSetup extends Setup {
  functions?: {
    source: string;
    codebase: string;
    languageChoice?: string;
  };

  [key: string]: unknown;
}

function showStartMessage(setup: GenkitSetup, command: string): void {
  logger.info();
  logger.info("\nLogin to Google Cloud using:");
  logger.info(
    clc.bold(
      clc.green(
        `    gcloud auth application-default login --project ${setup.projectId || "your-project-id"}\n`,
      ),
    ),
  );
  logger.info("Then start the Genkit developer experience by running:");
  logger.info(clc.bold(clc.green(`    ${command}`)));
}

/**
 * doSetup is the entry point for setting up the genkit suite.
 */
export async function doSetup(initSetup: Setup, config: Config, options: Options): Promise<void> {
  const setup: GenkitSetup = initSetup as GenkitSetup;
  const genkitInfo = await getGenkitInfo();
  if (genkitInfo.stopInstall) {
    logLabeledWarning("genkit", "Stopped Genkit initialization");
    return;
  }
  if (setup.functions?.languageChoice !== "typescript") {
    const continueFunctions = await confirm({
      message:
        "Genkit's Firebase integration uses Cloud Functions for Firebase with TypeScript.\nInitialize Functions to continue?",
      default: true,
    });
    if (!continueFunctions) {
      logLabeledWarning("genkit", "Stopped Genkit initialization");
      return;
    }

    // Functions with genkit should always be typescript
    setup.languageOverride = "typescript";
    await functionsSetup(setup, config, options);
    delete setup.languageOverride;
    logger.info();
  }

  if (!setup.functions) {
    throw new FirebaseError("Failed to initialize Genkit prerequisite: Firebase functions");
  }

  const projectDir = `${config.projectDir}/${setup.functions.source}`;

  const installType = await select({
    message: "Install the Genkit CLI globally or locally in this project?",
    choices: [
      { name: "Globally", value: "globally" },
      { name: "Just this project", value: "project" },
    ],
  });

  try {
    logLabeledBullet("genkit", `Installing Genkit CLI version ${genkitInfo.cliVersion}`);
    if (installType === "globally") {
      await wrapSpawn("npm", ["install", "-g", `genkit-cli@${genkitInfo.cliVersion}`], projectDir);
      await genkitSetup(options, genkitInfo, projectDir);
      showStartMessage(setup, `cd ${setup.functions.source} && npm run genkit:start`);
    } else {
      await wrapSpawn(
        "npm",
        ["install", `genkit-cli@${genkitInfo.cliVersion}`, "--save-dev"],
        projectDir,
      );
      await genkitSetup(options, genkitInfo, projectDir);
      showStartMessage(setup, `cd ${setup.functions.source} && npm run genkit:start`);
    }
  } catch (err) {
    logLabeledError("genkit", `Genkit initialization failed: ${getErrMsg(err)}`);
    return;
  }
}

export type ModelProvider = "googleai" | "vertexai" | "none";
export type WriteMode = "keep" | "overwrite" | "merge";

/**
 * Enables the Vertex AI API on a best effort basis.
 * @param options The options passed to the parent command
 */
export async function ensureVertexApiEnabled(options: Options): Promise<void> {
  const VERTEX_AI_URL = "https://aiplatform.googleapis.com";
  const projectId = getProjectId(options);
  if (!projectId) {
    return;
  }
  // If using markdown, enable it silently
  const silently = typeof options.markdown === "boolean" && options.markdown;
  return await ensure(projectId, VERTEX_AI_URL, "aiplatform", silently);
}

interface PluginInfo {
  // The name of the plugin
  plugin: string;
  // Imported items from `name` (can be comma list).
  imports: string;
  // Comment for 'the model import line.
  modelImportComment?: string;
  // Initializer call.
  init: string;
  // Model definition
  model?: string;
}

interface ModelOption {
  // Label for prompt option.
  label: string;
  // Provider (e.g. googleAI, vertexAI)
  provider?: string;
  // Plugin name.
  plugin?: string;
  // Package including version
  package?: string;
}

/** Model to plugin name. */
function getModelOptions(genkitInfo: GenkitInfo): Record<ModelProvider, ModelOption> {
  let modelOptions: Record<ModelProvider, ModelOption>;
  if (semver.gte(genkitInfo.templateVersion, UNIFIED_PLUGIN_VERSION)) {
    modelOptions = {
      vertexai: {
        label: "Google Cloud Vertex AI",
        provider: "vertexai",
        plugin: "@genkit-ai/google-genai",
        package: `@genkit-ai/google-genai@${genkitInfo.genaiVersion}`,
      },
      googleai: {
        label: "Google AI",
        provider: "googleai",
        plugin: "@genkit-ai/google-genai",
        package: `@genkit-ai/google-genai@${genkitInfo.genaiVersion}`,
      },
      none: { label: "None" },
    };
  } else {
    modelOptions = {
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
      none: { label: "None" },
    };
  }

  return modelOptions;
}

/** Plugin name to descriptor. */
const pluginToInfo: Record<string, PluginInfo> = {
  "@genkit-ai/firebase": {
    plugin: "@genkit-ai/firebase",
    imports: "firebase",
    init: `
    // Load the Firebase plugin, which provides integrations with several
    // Firebase services.
    firebase()`.trimStart(),
  },
  "@genkit-ai/google-genai(vertexai)": {
    plugin: "@genkit-ai/google-genai",
    imports: "vertexAI",
    modelImportComment: `
// Import vertexAI provider from the unified plugin. The Vertex AI API provides
// access to many models.`,
    init: `    // Load the VertexAI provider. You can optionally specify your location
    // and projectID by passing in a config object; if you don't, the provider
    // uses the value from environment variables like GCLOUD_PROJECT and GCLOUD_LOCATION.
    // If you want to use Vertex Express Mode, you can specify apiKey instead.
    vertexAI({location: "global"})`,
    model: 'vertexAI.model("gemini-2.5-flash")',
  },
  "@genkit-ai/google-genai(googleai)": {
    plugin: "@genkit-ai/google-genai",
    imports: "googleAI",
    modelImportComment: `
// Import googleAI provider from the unified plugin. The Gemini Developer API
// provides access to several generative models.`,
    init: `    // Load the GoogleAI provider. You can optionally specify your API key by
    // passing in a config object; if you don't, the provider uses the value
    // from the GOOGLE_GENAI_API_KEY environment variable, which is the
    // recommended practice.
    googleAI()`,
    model: 'googleAI.model("gemini-2.5-flash")',
  },
  "@genkit-ai/vertexai": {
    plugin: "@genkit-ai/vertexai",
    imports: "vertexAI",
    modelImportComment: `
// Import models from the Vertex AI plugin. The Vertex AI API provides access to
// several generative models. Here, we import Gemini 2.0 Flash.`.trimStart(),
    init: `
    // Load the Vertex AI plugin. You can optionally specify your project ID
    // by passing in a config object; if you don't, the Vertex AI plugin uses
    // the value from the GCLOUD_PROJECT environment variable.
    vertexAI({location: "us-central1"})`.trimStart(),
    model: 'vertexAI.model("gemini-2.5-flash")',
  },
  "@genkit-ai/googleai": {
    plugin: "@genkit-ai/googleai",
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
    model: 'googleAI.model("gemini-2.5-flash")',
  },
};

function getPluginInfo(option?: ModelOption): PluginInfo {
  if (option?.provider && option.plugin) {
    return pluginToInfo[`${option.plugin}(${option.provider})`];
  }
  if (option?.plugin) {
    return pluginToInfo[option.plugin];
  }
  return {
    plugin: "",
    imports: "",
    init: "",
  };
}

/** Basic packages required to use Genkit. */
function getBasePackages(genkitVersion: string): string[] {
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
export async function genkitSetup(
  options: Options,
  genkitInfo: GenkitInfo,
  projectDir: string,
): Promise<void> {
  // Choose a model
  const modelOptions = getModelOptions(genkitInfo);
  const supportedModels = Object.keys(modelOptions) as ModelProvider[];
  const model = await select<ModelProvider>({
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
  const pluginPackages: string[] = [];
  pluginPackages.push(`@genkit-ai/firebase@${genkitInfo.genkitVersion}`);
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
  if (
    options.nonInteractive ||
    (await confirm({
      message: "Would you like to generate a sample flow?",
      default: true,
    }))
  ) {
    logger.info(
      "Telemetry data can be used to monitor and gain insights into your AI features. There may be a cost associated with using this feature. See https://firebase.google.com/docs/genkit/observability/telemetry-collection.",
    );
    const enableTelemetry =
      options.nonInteractive ||
      (await confirm({
        message: "Would like you to enable telemetry collection?",
        default: true,
      }));

    generateSampleFile(
      modelOptions[model],
      projectDir,
      genkitInfo.templateVersion,
      enableTelemetry,
    );
  }
}

// We only need to worry about the compilerOptions entry.
interface TsConfig {
  compilerOptions?: Record<string, unknown>;
}

// A typeguard for the results of JSON.parse(<user defined file>);
export const isTsConfig = (value: unknown): value is TsConfig => {
  if (!isObject(value) || (value.compilerOptions && !isObject(value.compilerOptions))) {
    return false;
  }

  return true;
};

/**
 * Updates tsconfig.json with required flags for Genkit.
 * @param nonInteractive if we rae asking the user questions
 * @param projectDir the directory containing the tsconfig.json
 */
async function updateTsConfig(nonInteractive: boolean, projectDir: string): Promise<void> {
  const tsConfigPath = path.join(projectDir, "tsconfig.json");
  let existingTsConfig: TsConfig | undefined = undefined;
  if (fs.existsSync(tsConfigPath)) {
    const parsed: unknown = JSON.parse(fs.readFileSync(tsConfigPath, "utf-8"));
    if (!isTsConfig(parsed)) {
      throw new FirebaseError("Unable to parse existing tsconfig.json");
    }
    existingTsConfig = parsed;
  }
  let choice: WriteMode = "overwrite";
  if (!nonInteractive && existingTsConfig) {
    choice = await promptWriteMode(
      "Would you like to update your tsconfig.json with suggested settings?",
    );
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
  logLabeledBullet("genkit", "Updating tsconfig.json");
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
      logLabeledWarning("genkit", "Skipped updating tsconfig.json");
      return;
  }
  try {
    fs.writeFileSync(tsConfigPath, JSON.stringify(newTsConfig, null, 2));
    logLabeledSuccess("genkit", "Successfully updated tsconfig.json");
  } catch (err) {
    logLabeledError("genkit", `Failed to update tsconfig.json: ${getErrMsg(err)}`);
    process.exit(1);
  }
}

/**
 * Installs and saves NPM packages to package.json.
 * @param projectDir The project directory.
 * @param packages List of NPM packages to install.
 * @param devPackages List of NPM dev packages to install.
 */
async function installNpmPackages(
  projectDir: string,
  packages: string[],
  devPackages?: string[],
): Promise<void> {
  logLabeledBullet("genkit", "Installing NPM packages for genkit");
  try {
    if (packages.length) {
      await wrapSpawn("npm", ["install", ...packages, "--save"], projectDir);
    }
    if (devPackages?.length) {
      await wrapSpawn("npm", ["install", ...devPackages, "--save-dev"], projectDir);
    }
    logLabeledSuccess("genkit", "Successfully installed NPM packages");
  } catch (err) {
    logLabeledError("genkit", `Failed to install NPM packages: ${getErrMsg(err)}`);
    process.exit(1);
  }
}

/**
 * Generates a sample index.ts file.
 * @param modelOption Information about the model/plugin
 * @param projectDir Where to put the sample
 * @param templateVersion Which template the use
 * @param enableTelemetry If telemetry is enabled or not.
 */
function generateSampleFile(
  modelOption: ModelOption | undefined,
  projectDir: string,
  templateVersion: string,
  enableTelemetry: boolean,
): void {
  let modelImport = "";
  const pluginInfo = getPluginInfo(modelOption);
  if (pluginInfo.imports) {
    modelImport = "\n" + generateImportStatement(pluginInfo) + "\n";
  }
  let modelImportComment = "";
  if (pluginInfo.modelImportComment) {
    modelImportComment = `\n${pluginInfo.modelImportComment}`;
  }
  const commentedModelImport = `${modelImportComment}${modelImport}`;
  const templatePath = path.join(
    __dirname,
    `../../../../templates/genkit/firebase.${templateVersion}.template`,
  );
  const template = fs.readFileSync(templatePath, "utf8");
  const sample = renderConfig(
    pluginInfo,
    template
      .replace("$GENKIT_MODEL_IMPORT\n", commentedModelImport)
      .replace("$GENKIT_MODEL", pluginInfo.model ?? "'' /* TODO: Set a model. */"),
    enableTelemetry,
  );
  logLabeledBullet("genkit", "Generating sample file");
  try {
    const samplePath = "src/genkit-sample.ts";
    fs.writeFileSync(path.join(projectDir, samplePath), sample, "utf8");
    logLabeledSuccess("genkit", `Successfully generated sample file (${samplePath})`);
  } catch (err) {
    logLabeledError("genkit", `Failed to generate sample file: ${getErrMsg(err)}`);
    process.exit(1);
  }
}

// We only need to worry about the scripts entry
interface PackageJson {
  scripts?: Record<string, string>;
}

// A typeguard for the results of JSON.parse(<potentially user defined file>);
export const isPackageJson = (value: unknown): value is PackageJson => {
  if (!isObject(value) || (value.scripts && !isObject(value.scripts))) {
    return false;
  }

  return true;
};

/**
 * Updates package.json with Genkit-expected fields.
 * @param nonInteractive a boolean that indicates if we are asking questions or not
 * @param projectDir The directory to find the package.json file in.
 */
async function updatePackageJson(nonInteractive: boolean, projectDir: string): Promise<void> {
  const packageJsonPath = path.join(projectDir, "package.json");
  // package.json should exist before reaching this point.
  if (!fs.existsSync(packageJsonPath)) {
    throw new FirebaseError("Failed to find package.json.");
  }
  const existingPackageJson: unknown = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (!isPackageJson(existingPackageJson)) {
    throw new FirebaseError("Unable to parse existing package.json file");
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
  logLabeledBullet("genkit", "Updating package.json");
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
      logLabeledWarning("genkit", "Skipped updating package.json");
      return;
  }
  try {
    fs.writeFileSync(packageJsonPath, JSON.stringify(newPackageJson, null, 2));
    logLabeledSuccess("genkit", "Successfully updated package.json");
  } catch (err) {
    logLabeledError("genkit", `Failed to update package.json: ${getErrMsg(err)}`);
    process.exit(1);
  }
}

function renderConfig(pluginInfo: PluginInfo, template: string, enableTelemetry: boolean): string {
  const plugins = pluginInfo.init || "    /* Add your plugins here. */";
  return template
    .replace("$GENKIT_CONFIG_IMPORTS", generateImportStatement(pluginInfo))
    .replace("$GENKIT_CONFIG_PLUGINS", plugins)
    .replaceAll("$TELEMETRY_COMMENT", enableTelemetry ? "" : "// ");
}

function generateImportStatement(pluginInfo: PluginInfo): string {
  if (pluginInfo.imports && pluginInfo.plugin) {
    return `import {${pluginInfo.imports}} from "${pluginInfo.plugin}";`;
  }
  return "";
}

/**
 * Prompts for what type of write to perform when there is a conflict.
 * @param message The question to ask
 * @param defaultOption The default WriteMode to highlight
 * @return The writemode selected
 */
export async function promptWriteMode(
  message: string,
  defaultOption: WriteMode = "merge",
): Promise<WriteMode> {
  return select({
    message,
    choices: [
      { name: "Set if unset", value: "merge" },
      { name: "Overwrite", value: "overwrite" },
      { name: "Keep unchanged", value: "keep" },
    ],
    default: defaultOption,
  });
}
