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
import * as inquirer from "inquirer";
import * as path from "path";
import * as semver from "semver";
import { execFileSync } from "child_process";

import { doSetup as functionsSetup } from "../functions";
import { Config } from "../../../config";
import { promptOnce } from "../../../prompt";
import { wrapSpawn } from "../../spawn";
import { Options } from "../../../options";
import { getProjectId } from "../../../projectUtils";
import { ensure } from "../../../ensureApiEnabled";
import { logger } from "../../../logger";
import { FirebaseError } from "../../../error";

interface GenkitInfo {
  genkitVersion: string;
  sampleVersion: string;
  useInit: boolean;
}

function getGenkitVersion(): GenkitInfo {
  let genkitVersion: string;
  let sampleVersion: string | undefined;
  let useInit: boolean;

  // Allow the installed version to be set for dev purposes.
  if (process.env.GENKIT_DEV_VERSION && typeof process.env.GENKIT_DEV_VERSION === "string") {
    semver.parse(process.env.GENKIT_DEV_VERSION);
    genkitVersion = process.env.GENKIT_DEV_VERSION;
  } else {
    genkitVersion = execFileSync("npm", ["view", "genkit", "version"]).toString();
  }

  if (!genkitVersion) {
    throw new FirebaseError("Unable to determine genkit version to install");
  }

  if (semver.gte(genkitVersion, "1.0.0")) {
    // We don't know about this version.
    throw new FirebaseError(
      "Please update your firebase-tools. Alternatively you can set a GENKIT_DEV_VERSION environment variable to choose a genkit version < 1.0.0",
    );
  } else if (semver.gte(genkitVersion, "0.6.0")) {
    sampleVersion = "0.9.0";
    useInit = false;
  } else {
    sampleVersion = "";
    useInit = true;
  }

  return { genkitVersion, sampleVersion, useInit };
}

/**
 * doSetup is the entry point for setting up the genkit suite.
 */
export async function doSetup(setup: any, config: Config, options: Options): Promise<void> {
  const genkitInfo = getGenkitVersion();
  if (setup.functions?.languageChoice !== "typescript") {
    const continueFunctions = await promptOnce({
      type: "confirm",
      message:
        "Genkit's Firebase integration uses Cloud Functions for Firebase with TypeScript. Initialize Functions to continue?",
      default: true,
    });
    if (!continueFunctions) {
      logger.info("Stopped Genkit initialization");
      return;
    }

    // Functions with genkit should always be typescript
    setup.languageOverride = "typescript";
    await functionsSetup(setup, config, options);
    delete setup.languageOverride;
    logger.info();
  }

  const projectDir: string = `${config.projectDir}/${setup.functions.source}`;

  const installType = await promptOnce({
    type: "list",
    message: "Install the Genkit CLI globally or locally in this project?",
    choices: [
      { name: "Globally", value: "globally" },
      { name: "Just this project", value: "project" },
    ],
  });

  try {
    logger.info("Installing Genkit CLI");
    if (installType === "globally") {
      await wrapSpawn("npm", ["install", "-g", `genkit@${genkitInfo.genkitVersion}`], projectDir);
      if (genkitInfo.useInit) {
        await wrapSpawn("genkit", ["init", "-p", "firebase"], projectDir);
        logger.info("Start the Genkit developer experience by running:");
        logger.info(`    cd ${setup.functions.source} && genkit start`);
      } else {
        await genkitSetup(options, genkitInfo, projectDir);
        logger.info("Start the Genkit developer experience by running:");
        logger.info(`    cd ${setup.functions.source} && npm run genkit:start`);
      }
    } else {
      await wrapSpawn(
        "npm",
        ["install", `genkit@${genkitInfo.genkitVersion}`, "--save-dev"],
        projectDir,
      );
      if (genkitInfo.useInit) {
        await wrapSpawn("npx", ["genkit", "init", "-p", "firebase"], projectDir);
        logger.info("Start the Genkit developer experience by running:");
        logger.info(`    cd ${setup.functions.source} && npx genkit start`);
      } else {
        await genkitSetup(options, genkitInfo, projectDir);
        logger.info("Start the Genkit developer experience by running:");
        logger.info(`    cd ${setup.functions.source} && npm run genkit:start`);
      }
    }
  } catch (e) {
    logger.error("Genkit initialization failed...");
    return;
  }
}

export type ModelProvider = "googleai" | "vertexai" | "ollama" | "none";
export type WriteMode = "keep" | "overwrite" | "merge";

/**
 * Displays info about the selected model.
 * @param model selected model
 */
export function showModelInfo(model: ModelProvider) {
  switch (model) {
    case "ollama":
      logger.info(
        `If you don't have Ollama already installed and configured, refer to https://developers.google.com/genkit/plugins/ollama\n`,
      );
      break;
  }
}

export async function ensureVertexApiEnabled(options: any): Promise<void> {
  const VERTEX_AI_URL = "https://aiplatform.googleapis.com";
  const projectId = getProjectId(options);
  if (!projectId) {
    return;
  }
  return await ensure(projectId, VERTEX_AI_URL, "aiplatform", options.markdown);
}

/**
 * Shows a confirmation prompt.
 */
export async function confirm(args: { default?: boolean; message?: string }): Promise<boolean> {
  const message = args.message ?? `Do you wish to continue?`;
  const answer = await inquirer.prompt({
    type: "confirm",
    name: "confirm",
    message,
    default: args.default,
  });
  return answer.confirm;
}

interface PluginInfo {
  // Imported items from `name` (can be comma list).
  imports: string;
  // Comment for 'the model import line.
  modelImportComment?: string;
  // Initializer call.
  init: string;
  // Model name as an imported reference.
  model?: string;
  // Model name as a string reference.
  modelStr?: string;
}

interface PromptOption {
  // Label for prompt option.
  label: string;
  // Plugin name.
  plugin?: string;
  // Package including version
  package?: string;
}

/** Model to plugin name. */
function getModelOptions(genkitVersion: string): Record<ModelProvider, PromptOption> {
  const modelOptions: Record<ModelProvider, PromptOption> = {
    googleai: {
      label: "Google AI",
      plugin: "@genkit-ai/googleai",
      package: `@genkit-ai/googleai@${genkitVersion}`,
    },
    vertexai: {
      label: "Google Cloud Vertex AI",
      plugin: "@genkit-ai/vertexai",
      package: `@genkit-ai/vertexai@${genkitVersion}`,
    },
    ollama: {
      label: "Ollama (e.g. Gemma)",
      plugin: "genkitx-ollama",
      package: `genkitx-ollama@${genkitVersion}`,
    },
    none: { label: "None", plugin: undefined, package: undefined },
  };
  return modelOptions;
}

/** Plugin name to descriptor. */
const pluginToInfo: Record<string, PluginInfo> = {
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
// several generative models. Here, we import Gemini 1.5 Flash.`.trimStart(),
    init: `
    // Load the Vertex AI plugin. You can optionally specify your project ID
    // by passing in a config object; if you don't, the Vertex AI plugin uses
    // the value from the GCLOUD_PROJECT environment variable.
    vertexAI({ location: 'us-central1' })`.trimStart(),
    model: "gemini15Flash",
  },
  "genkitx-ollama": {
    imports: "ollama",
    init: `
    ollama({
      // Ollama provides an interface to many open generative models. Here,
      // we specify Google's Gemma model. The models you specify must already be
      // downloaded and available to the Ollama server.
      models: [{ name: 'gemma' }],
      // The address of your Ollama API server. This is often a different host
      // from your app backend (which runs Genkit), in order to run Ollama on
      // a GPU-accelerated machine.
      serverAddress: 'http://127.0.0.1:11434',
    })`.trimStart(),
    modelStr: "'ollama/gemma'",
  },
  "@genkit-ai/googleai": {
    imports: "googleAI",
    modelImportComment: `
// Import models from the Google AI plugin. The Google AI API provides access to
// several generative models. Here, we import Gemini 1.5 Flash.`.trimStart(),
    init: `
    // Load the Google AI plugin. You can optionally specify your API key
    // by passing in a config object; if you don't, the Google AI plugin uses
    // the value from the GOOGLE_GENAI_API_KEY environment variable, which is
    // the recommended practice.
    googleAI()`.trimStart(),
    model: "gemini15Flash",
  },
};

/** Basic packages required to use Genkit. */
function getBasePackages(genkitVersion: string): string[] {
  const basePackages = ["zod", "express", `genkit@${genkitVersion}`];
  return basePackages;
}

/** External dev packages required to use Genkit. */
const externalDevPackages = ["typescript", "tsx"];

/**
 * Initializes a Genkit Node.js project.
 *
 * @param options command-line arguments
 */
export async function genkitSetup(options: Options, genkitInfo: GenkitInfo, projectDir: string) {
  // Choose a model
  const modelOptions = getModelOptions(genkitInfo.genkitVersion);
  const supportedModels = Object.keys(modelOptions) as ModelProvider[];
  const answer = await inquirer.prompt<{ model: ModelProvider }>([
    {
      type: "list",
      name: "model",
      message: "Select a model provider:",
      choices: supportedModels.map((model) => ({
        name: modelOptions[model].label,
        value: model,
      })),
    },
  ]);
  const model = answer.model;

  if (model === "vertexai") {
    await ensureVertexApiEnabled(options);
  }

  // Compile plugins list.
  const plugins: string[] = [];
  const pluginPackages: string[] = [];
  pluginPackages.push(`@genkit-ai/firebase@${genkitInfo.genkitVersion}`);

  if (modelOptions[model]?.plugin) {
    plugins.push(modelOptions[model].plugin!);
  }
  if (modelOptions[model]?.package) {
    pluginPackages.push(modelOptions[model].package!);
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
    generateSampleFile(modelOptions[model].plugin, plugins, projectDir, genkitInfo.sampleVersion);
  }
  showModelInfo(model);
}

/**
 * Updates tsconfig.json with required flags for Genkit.
 */
async function updateTsConfig(nonInteractive: boolean, projectDir: string) {
  const tsConfigPath = path.join(projectDir, "tsconfig.json");
  let existingTsConfig = undefined;
  if (fs.existsSync(tsConfigPath)) {
    existingTsConfig = JSON.parse(fs.readFileSync(tsConfigPath, "utf-8"));
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
  logger.info("Updating tsconfig.json");
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
      logger.warn("Skipped updating tsconfig.json");
      return;
  }
  try {
    fs.writeFileSync(tsConfigPath, JSON.stringify(newTsConfig, null, 2));
    logger.info("Successfully updated tsconfig.json");
  } catch (err) {
    logger.error(`Failed to update tsconfig.json: ${err}`);
    process.exit(1);
  }
}

/**
 * Installs and saves NPM packages to package.json.
 * @param packages List of NPM packages to install.
 * @param devPackages List of NPM dev packages to install.
 */
async function installNpmPackages(
  projectDir: string,
  packages: string[],
  devPackages?: string[],
): Promise<void> {
  logger.info("Installing NPM packages for genkit");
  try {
    if (packages.length) {
      await wrapSpawn("npm", ["install", ...packages, "--save"], projectDir);
    }
    if (devPackages?.length) {
      await wrapSpawn("npm", ["install", ...devPackages, "--save-dev"], projectDir);
    }
    logger.info("Successfully installed NPM packages");
  } catch (err) {
    logger.error(`Failed to install NPM packages: ${err}`);
    process.exit(1);
  }
}

/**
 * Generates a sample index.ts file.
 * @param modelPlugin Model plugin name.
 * @param configPlugins config plugins.
 */
function generateSampleFile(
  modelPlugin: string | undefined,
  configPlugins: string[],
  projectDir: string,
  sampleVersion: string,
) {
  const modelImport =
    modelPlugin && pluginToInfo[modelPlugin].model
      ? "\n" + generateImportStatement(pluginToInfo[modelPlugin].model!, modelPlugin) + "\n"
      : "";
  const modelImportComment =
    modelPlugin && pluginToInfo[modelPlugin].modelImportComment
      ? `\n${pluginToInfo[modelPlugin].modelImportComment}`
      : "";
  const commentedModelImport = `${modelImportComment}${modelImport}`;
  const templatePath = path.join(
    __dirname,
    `../../../../templates/genkit/firebase.${sampleVersion}.template`,
  );
  const template = fs.readFileSync(templatePath, "utf8");
  const sample = renderConfig(
    configPlugins,
    template
      .replace("$GENKIT_MODEL_IMPORT\n", commentedModelImport)
      .replace(
        "$GENKIT_MODEL",
        modelPlugin
          ? pluginToInfo[modelPlugin].model || pluginToInfo[modelPlugin].modelStr || ""
          : "'' /* TODO: Set a model. */",
      ),
  );
  logger.info("Generating sample file");
  try {
    const samplePath = "src/genkit-sample.ts";
    fs.writeFileSync(path.join(projectDir, samplePath), sample, "utf8");
    logger.info(`Successfully generated sample file (${samplePath})`);
  } catch (err) {
    logger.error(`Failed to generate sample file: ${err}`);
    process.exit(1);
  }
}

/**
 * Updates package.json with Genkit-expected fields.
 */
async function updatePackageJson(nonInteractive: boolean, projectDir: string) {
  const packageJsonPath = path.join(projectDir, "package.json");
  // package.json should exist before reaching this point.
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error("Failed to find package.json.");
  }
  const existingPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const choice = nonInteractive
    ? "overwrite"
    : await promptWriteMode("Would you like to update your package.json with suggested settings?");
  const packageJson = {
    main: "lib/index.js",
    scripts: {
      "genkit:start": "genkit ui:start && GENKIT_ENV=dev tsx --watch src/genkit-sample.ts",
      "genkit:stop": "genkit ui:stop",
    },
  };
  logger.info("Updating package.json");
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
      logger.warn("Skipped updating package.json");
      return;
  }
  try {
    fs.writeFileSync(packageJsonPath, JSON.stringify(newPackageJson, null, 2));
    logger.info("Successfully updated package.json");
  } catch (err) {
    logger.error(`Failed to update package.json: ${err}`);
    process.exit(1);
  }
}

function renderConfig(pluginNames: string[], template: string): string {
  const imports = pluginNames
    .map((pluginName) => generateImportStatement(pluginToInfo[pluginName].imports, pluginName))
    .join("\n");
  const plugins =
    pluginNames.map((pluginName) => `    ${pluginToInfo[pluginName].init},`).join("\n") ||
    "    /* Add your plugins here. */";
  return template
    .replace("$GENKIT_CONFIG_IMPORTS", imports)
    .replace("$GENKIT_CONFIG_PLUGINS", plugins);
}

function generateImportStatement(imports: string, name: string): string {
  return `import {${imports}} from "${name}";`;
}

/**
 * Prompts for what type of write to perform when there is a conflict.
 */
export async function promptWriteMode(
  message: string,
  defaultOption: WriteMode = "merge",
): Promise<WriteMode> {
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "option",
      message,
      choices: [
        { name: "Set if unset", value: "merge" },
        { name: "Overwrite", value: "overwrite" },
        { name: "Keep unchanged", value: "keep" },
      ],
      default: defaultOption,
    },
  ]);
  return answers.option;
}
