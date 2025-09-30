import * as clc from "colorette";

import { logger } from "../../../logger";
import { Choice, confirm, input, select } from "../../../prompt";
import { requirePermissions } from "../../../requirePermissions";
import { Options } from "../../../options";
import { ensure } from "../../../ensureApiEnabled";
import { Config } from "../../../config";
import { Setup } from "../..";
import { FirebaseError } from "../../../error";
import { functionsOrigin, runtimeconfigOrigin } from "../../../api";
import {
  normalizeAndValidate,
  configForCodebase,
  requireLocal,
  validateCodebase,
} from "../../../functions/projectConfig";
import * as supported from "../../../deploy/functions/runtimes/supported";

type Language = "javascript" | "typescript" | "python";

const MAX_ATTEMPTS = 5;
export const DEFAULT_CODEBASE = "default";
export const DEFAULT_SOURCE = Config.DEFAULT_FUNCTIONS_SOURCE;
export const DEFAULT_LANGUAGE: Language = "typescript";
export const DEFAULT_LINT = false;
export const DEFAULT_INSTALL_DEPENDENCIES = false;

export interface RequiredInfo {
  overwrite: boolean;
  codebase: string;
  source: string;
  language: Language;
  lint?: boolean;
  installDependencies?: boolean;
}

/**
 * Sets up Cloud Functions for a Firebase project.
 */
export async function doSetup(setup: Setup, config: Config, options: Options): Promise<void> {
  setup.featureInfo = setup.featureInfo || {};
  await askQuestions(setup, config, options);
  await actuate(setup, config, options);
}

/**
 * Gathers information from the user to configure Cloud Functions.
 */
export async function askQuestions(setup: Setup, config: Config, options: Options): Promise<void> {
  const projectId = resolveProjectId(setup, options);
  if (projectId) {
    await ensureProjectSetup(projectId, options);
  }

  const info: RequiredInfo = {
    overwrite: false,
    codebase: DEFAULT_CODEBASE,
    source: DEFAULT_SOURCE,
    language: DEFAULT_LANGUAGE,
    lint: undefined,
    installDependencies: undefined,
  };

  const existingConfig = config.src.functions
    ? normalizeAndValidate(config.src.functions)
    : undefined;

  if (!existingConfig || existingConfig.length === 0) {
    logNewCodebaseIntro();
  } else {
    logger.info();
    const codebases = existingConfig.map((cfg) => clc.bold(cfg.codebase)).join(", ");
    logger.info(`Detected existing codebase(s): ${codebases}`);
    logger.info();

    const initOpt = await select({
      message: "Would you like to initialize a new codebase, or overwrite an existing one?",
      default: "new",
      choices: [
        {
          name: "Initialize",
          value: "new",
        },
        {
          name: "Overwrite",
          value: "overwrite",
        },
      ],
    });

    if (initOpt === "new") {
      const { codebase, source } = await promptForNewCodebase(existingConfig);
      info.codebase = codebase;
      info.source = source;
    } else {
      info.overwrite = true;
      const { codebase, source } = await promptForOverwrite(existingConfig);
      info.codebase = codebase;
      info.source = source;
    }
  }

  info.language = await select<Language>({
    message: "What language would you like to use to write Cloud Functions?",
    default: DEFAULT_LANGUAGE,
    choices: [
      {
        name: "JavaScript",
        value: "javascript",
      },
      {
        name: "TypeScript",
        value: "typescript",
      },
      {
        name: "Python",
        value: "python",
      },
    ],
  });

  if (info.language === "javascript") {
    info.lint = await confirm(
      "Do you want to use ESLint to catch probable bugs and enforce style?",
    );
  } else if (info.language === "typescript") {
    info.lint = await confirm({
      message: "Do you want to use ESLint to catch probable bugs and enforce style?",
      default: false,
    });
  }

  if (info.language === "python") {
    info.installDependencies = await confirm({
      message: "Do you want to install dependencies now?",
      default: true,
    });
  } else {
    info.installDependencies = await confirm({
      message: "Do you want to install dependencies with npm now?",
      default: true,
    });
  }

  setup.featureInfo = setup.featureInfo || {};
  setup.featureInfo.functions = info;
}

/**
 * Performs the actual setup of Cloud Functions based on the provided configuration.
 */
export async function actuate(setup: Setup, config: Config, options: Options): Promise<void> {
  const info = setup.featureInfo?.functions;
  if (!info) {
    throw new FirebaseError("functions featureInfo is not found");
  }

  const projectId = resolveProjectId(setup, options);
  if (projectId) {
    await ensureProjectSetup(projectId, options);
  }

  const language: Language = info.language || DEFAULT_LANGUAGE;
  const lint = info.lint ?? DEFAULT_LINT;
  const installDependencies = info.installDependencies ?? DEFAULT_INSTALL_DEPENDENCIES;
  const codebase = info.codebase || DEFAULT_CODEBASE;
  const source = info.source || DEFAULT_SOURCE;
  const functionsConfig = ensureFunctionsConfigArray(setup);
  const targetConfig = prepareTargetConfig(functionsConfig, info.overwrite, codebase, source);

  applyLanguageDefaults(targetConfig, language, lint);

  // Validate configuration to surface any conflicts early.
  setup.config.functions = normalizeAndValidate(setup.config.functions || functionsConfig);

  const scaffoldingState: any = {
    config: {
      functions: setup.config.functions,
    },
    functions: {
      codebase,
      source,
      lint,
      npm: installDependencies,
    },
    installDependencies,
  };

  const languageModule = require("./" + language);
  await languageModule.setup(scaffoldingState, config, options);

  const generatedFiles: Array<{ path: string; description: string }> = [];
  switch (language) {
    case "javascript":
      generatedFiles.push({
        path: `${source}/package.json`,
        description: "Defines Cloud Functions dependencies and scripts.",
      });
      if (lint) {
        generatedFiles.push({
          path: `${source}/.eslintrc.js`,
          description: "ESLint configuration for catching bugs and enforcing style.",
        });
      }
      generatedFiles.push({
        path: `${source}/index.js`,
        description: "Sample HTTP function entry point.",
      });
      generatedFiles.push({
        path: `${source}/.gitignore`,
        description: "Ignores build artifacts and node_modules in the functions directory.",
      });
      break;
    case "typescript":
      generatedFiles.push({
        path: `${source}/package.json`,
        description: "Defines Cloud Functions dependencies and scripts (including TypeScript build).",
      });
      if (lint) {
        generatedFiles.push({
          path: `${source}/.eslintrc.js`,
          description: "ESLint configuration for the TypeScript codebase.",
        });
        generatedFiles.push({
          path: `${source}/tsconfig.dev.json`,
          description: "TypeScript config used during local development.",
        });
      }
      generatedFiles.push({
        path: `${source}/tsconfig.json`,
        description: "TypeScript compiler configuration for Cloud Functions.",
      });
      generatedFiles.push({
        path: `${source}/src/index.ts`,
        description: "Sample HTTP function written in TypeScript.",
      });
      generatedFiles.push({
        path: `${source}/.gitignore`,
        description: "Ignores build artifacts and node_modules in the functions directory.",
      });
      break;
    case "python":
      generatedFiles.push({
        path: `${source}/requirements.txt`,
        description: "Python dependencies required by the generated sample function.",
      });
      generatedFiles.push({
        path: `${source}/main.py`,
        description: "Sample HTTP function entry point written in Python.",
      });
      generatedFiles.push({
        path: `${source}/.gitignore`,
        description: "Ignores virtual environment artifacts in the functions directory.",
      });
      break;
  }

  if (generatedFiles.length) {
    const bulletList = generatedFiles
      .map((file) => `- ${file.path}: ${file.description}`)
      .join("\n");
    setup.instructions.push(`Files generated for Cloud Functions:\n\n${bulletList}`);
  }

  const functionsConfigForDisplay = Array.isArray(setup.config.functions)
    ? setup.config.functions
    : [setup.config.functions];
  if (functionsConfigForDisplay.length) {
    const snippet = JSON.stringify(functionsConfigForDisplay, null, 2);
    setup.instructions.push(
      "firebase.json 'functions' configuration updated to:\n\n".concat(snippet),
    );
  }

  if (!installDependencies) {
    setup.instructions.push(
      language === "python"
        ? `Install dependencies for the '${codebase}' codebase by activating the virtual environment in '${source}' and running 'pip install -r requirements.txt'.`
        : `Install npm dependencies for the '${codebase}' codebase with 'npm install --prefix ${source}'.`,
    );
  }
  setup.instructions.push("Deploy your Cloud Functions with 'firebase deploy --only functions'.");
  setup.instructions.push(
    "Review firebase.json before committing so you don't remove existing functions entries unintentionally; rerun with overwrite set to true if you meant to replace a codebase.",
  );

  setup.functions = {
    source,
    codebase,
    languageChoice: language,
    lint,
  };
}

function resolveProjectId(setup: Setup, options: Options): string | undefined {
  return setup.projectId || options.project || setup.rcfile?.projects?.default;
}

async function ensureProjectSetup(projectId: string, options: Options): Promise<void> {
  await requirePermissions({ ...options, project: projectId });
  await Promise.all([
    ensure(projectId, functionsOrigin(), "unused", true),
    ensure(projectId, runtimeconfigOrigin(), "unused", true),
  ]);
}

function ensureFunctionsConfigArray(setup: Setup): any[] {
  const current = setup.config.functions;
  if (!current) {
    const arr: any[] = [];
    setup.config.functions = arr;
    return arr;
  }
  if (Array.isArray(current)) {
    return current;
  }
  const arr = [current];
  setup.config.functions = arr;
  return arr;
}

function prepareTargetConfig(
  configs: any[],
  overwrite: boolean,
  codebase: string,
  source: string,
): any {
  if (overwrite) {
    const existing = configs.find((cfg) => cfg.codebase === codebase);
    if (!existing) {
      throw new FirebaseError(
        `Cannot overwrite Cloud Functions codebase '${codebase}' because it was not found in firebase.json.`,
      );
    }
    if (!existing.source) {
      throw new FirebaseError(
        `Codebase '${codebase}' is configured with a remote source and cannot be overwritten locally.`,
      );
    }
    existing.source = source;
    delete existing.remoteSource;
    return existing;
  }

  if (configs.some((cfg) => cfg.codebase === codebase)) {
    throw new FirebaseError(
      `A Cloud Functions codebase named '${codebase}' already exists. Set overwrite to true to replace it.`,
    );
  }
  if (configs.some((cfg) => cfg.source === source)) {
    throw new FirebaseError(
      `A Cloud Functions source directory '${source}' already exists in firebase.json. Choose a different 'source' or overwrite the existing codebase.`,
    );
  }

  const target = { codebase, source };
  configs.push(target);
  return target;
}

function applyLanguageDefaults(configEntry: any, language: Language, lint: boolean): void {
  switch (language) {
    case "javascript":
      configEntry.ignore = [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log",
        "*.local",
      ];
      if (lint) {
        configEntry.predeploy = ['npm --prefix "$RESOURCE_DIR" run lint'];
      } else {
        delete configEntry.predeploy;
      }
      delete configEntry.runtime;
      break;
    case "typescript":
      configEntry.ignore = [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log",
        "*.local",
      ];
      configEntry.predeploy = lint
        ? ['npm --prefix "$RESOURCE_DIR" run lint', 'npm --prefix "$RESOURCE_DIR" run build']
        : ['npm --prefix "$RESOURCE_DIR" run build'];
      delete configEntry.runtime;
      break;
    case "python":
      configEntry.ignore = [
        "venv",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log",
        "*.local",
      ];
      configEntry.runtime = supported.latest("python");
      delete configEntry.predeploy;
      break;
  }
}

async function promptForNewCodebase(existing?: ReturnType<typeof normalizeAndValidate>) {
  logNewCodebaseIntro();

  const configs = existing ?? [];
  if (configs.length === 0) {
    return { codebase: DEFAULT_CODEBASE, source: DEFAULT_SOURCE };
  }

  let attempts = 0;
  let codebase = DEFAULT_CODEBASE;
  while (attempts++ < MAX_ATTEMPTS) {
    try {
      const answer = await input("What should be the name of this codebase?");
      validateCodebase(answer);
      if (configs.some((cfg) => cfg.codebase === answer)) {
        throw new FirebaseError(`Codebase '${answer}' already exists. Please choose another name.`);
      }
      codebase = answer;
      break;
    } catch (err: any) {
      logger.error(err as FirebaseError);
      if (attempts >= MAX_ATTEMPTS) {
        throw new FirebaseError(
          "Exceeded max number of attempts to input valid codebase name. Please restart.",
        );
      }
    }
  }

  attempts = 0;
  while (attempts++ < MAX_ATTEMPTS) {
    const answer = await input({
      message: `In what sub-directory would you like to initialize your functions for codebase ${clc.bold(
        codebase,
      )}?`,
      default: codebase,
    });
    if (configs.some((cfg) => cfg.source === answer)) {
      logger.error(
        new FirebaseError(
          `Source directory '${answer}' is already used by another codebase. Please choose a different directory.`,
        ),
      );
      continue;
    }
    return { codebase, source: answer };
  }

  throw new FirebaseError("Exceeded max number of attempts to input valid source. Please restart.");
}

async function promptForOverwrite(existing: ReturnType<typeof normalizeAndValidate>) {
  let codebase: string;
  if (existing.length === 1) {
    codebase = existing[0].codebase;
  } else {
    const choices: Choice<string>[] = existing.map((cfg) => ({
      name: cfg.codebase,
      value: cfg.codebase,
    }));
    codebase = await select<string>({
      message: "Which codebase would you like to overwrite?",
      choices,
    });
  }

  const cfg = requireLocal(
    configForCodebase(existing, codebase),
    "Cannot overwrite a remote Cloud Functions codebase. Use firebase init with a local source.",
  );

  logger.info();
  logger.info(`Overwriting ${clc.bold(`codebase ${codebase}...`)}\n`);

  return { codebase, source: cfg.source };
}

function logNewCodebaseIntro(): void {
  logger.info("Let's create a new codebase for your functions.");
  logger.info("A directory corresponding to the codebase will be created in your project");
  logger.info("with sample code pre-configured.\n");
  logger.info("See https://firebase.google.com/docs/functions/organize-functions for");
  logger.info("more information on organizing your functions using codebases.\n");
  logger.info(`Functions can be deployed with ${clc.bold("firebase deploy")}.`);
  logger.info();
}
