import * as clc from "colorette";

import { Command } from "../command";
import { Config } from "../config";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { wrapSpawn } from "../init/spawn";
import { readTemplateSync } from "../templates";
import * as supported from "../deploy/functions/runtimes/supported";
import {
  assertUnique,
  normalize,
  validateCodebase,
  ValidatedConfig,
} from "../functions/projectConfig";
import * as utils from "../utils";

const PACKAGE_NO_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/typescript/package.nolint.json",
);
const TSCONFIG_TEMPLATE = readTemplateSync("init/functions/typescript/tsconfig.json");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/typescript/_gitignore");

function sanitizePackageNameToCodebase(pkgName: string): string {
  const sanitized = pkgName
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/[^a-z0-9_-]/g, "");
  if (!sanitized) {
    return "functions";
  }
  return sanitized.slice(0, 63);
}

export const command = new Command("functions:kits:install")
  .description("install an npm package filled with Cloud Functions into a new functions codebase")
  .option("--npm_package <package_name>", "the npm package containing Cloud Functions to install")
  .option(
    "--codebase <codebase>",
    "the codebase name to initialize (defaults to sanitized package name)",
  )
  .option("--source <source>", "the directory for the new codebase (defaults to codebase name)")
  .action(async (options: { npm_package?: string; codebase?: string; source?: string } & any) => {
    if (!options.npm_package) {
      throw new FirebaseError(
        `Must specify an npm package in ${clc.bold("--npm_package <package_name>")} option.`,
      );
    }

    const config = Config.load(options, true);
    if (!config) {
      throw new FirebaseError(
        "Must be run from a Firebase project directory. Run 'firebase init' to initialize.",
      );
    }

    let existingFunctions: ValidatedConfig | [] = [];
    if (
      config.src.functions &&
      (!Array.isArray(config.src.functions) || config.src.functions.length > 0)
    ) {
      try {
        existingFunctions = normalize(config.src.functions) as ValidatedConfig;
      } catch (err: any) {
        throw new FirebaseError(`Invalid existing functions configuration: ${err.message}`);
      }
    }

    const codebase = options.codebase || sanitizePackageNameToCodebase(options.npm_package);
    const source = options.source || codebase;

    try {
      validateCodebase(codebase);
      if (existingFunctions.length > 0) {
        assertUnique(existingFunctions as any, "codebase", codebase);
        assertUnique(existingFunctions as any, "source", source);
      }
    } catch (err: any) {
      throw new FirebaseError(`Codebase / source validation failed: ${err.message}`);
    }

    logger.info(
      `Creating new functions codebase ${clc.bold(codebase)} in directory ${clc.bold(source)}...`,
    );

    const newFunctionsConfig = {
      source,
      codebase,
      predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
      disallowLegacyRuntimeConfig: true,
    };

    let updatedFunctionsConfig: any;
    if (Array.isArray(config.src.functions)) {
      updatedFunctionsConfig = [...config.src.functions, newFunctionsConfig];
    } else if (config.src.functions) {
      updatedFunctionsConfig = [config.src.functions, newFunctionsConfig];
    } else {
      updatedFunctionsConfig = [newFunctionsConfig];
    }

    config.set("functions", updatedFunctionsConfig);
    config.writeProjectFile("firebase.json", config.src);

    const runtime = supported.latest("nodejs").replace("nodejs", "");
    const packageJsonContent = PACKAGE_NO_LINTING_TEMPLATE.replace("{{RUNTIME}}", runtime);

    await config.askWriteProjectFile(`${source}/package.json`, packageJsonContent);
    await config.askWriteProjectFile(`${source}/tsconfig.json`, TSCONFIG_TEMPLATE);
    await config.askWriteProjectFile(`${source}/.gitignore`, GITIGNORE_TEMPLATE);

    logger.info(`Installing base dependencies in ${clc.bold(source)}...`);
    try {
      await wrapSpawn("npm", ["install"], `${config.projectDir}/${source}`);
    } catch (err: any) {
      throw new FirebaseError(`Failed to install base dependencies in ${source}: ${err.message}`);
    }

    const beforePkg = config.readProjectFile(`${source}/package.json`, {
      json: true,
      fallback: {},
    });
    const initialDeps = new Set([
      ...Object.keys(beforePkg.dependencies || {}),
      ...Object.keys(beforePkg.devDependencies || {}),
    ]);

    logger.info(`Installing kits package ${clc.bold(options.npm_package)}...`);
    try {
      await wrapSpawn(
        "npm",
        ["install", "--save", options.npm_package],
        `${config.projectDir}/${source}`,
      );
    } catch (err: any) {
      throw new FirebaseError(
        `Failed to install package ${options.npm_package} in ${source}: ${err.message}`,
      );
    }

    const afterPkg = config.readProjectFile(`${source}/package.json`, { json: true, fallback: {} });
    const afterDeps = [
      ...Object.keys(afterPkg.dependencies || {}),
      ...Object.keys(afterPkg.devDependencies || {}),
    ];
    let installedPackageName = afterDeps.find((dep) => !initialDeps.has(dep));
    if (!installedPackageName) {
      const raw = options.npm_package as string;
      if (raw.startsWith("@")) {
        installedPackageName = "@" + raw.slice(1).split("@")[0];
      } else {
        installedPackageName = raw.split("@")[0];
      }
    }

    const indexContent = `export * from "${installedPackageName}";\n`;
    await config.askWriteProjectFile(`${source}/src/index.ts`, indexContent);

    logger.info(`Building TypeScript functions in ${clc.bold(source)}...`);
    try {
      await wrapSpawn("npm", ["run", "build"], `${config.projectDir}/${source}`);
    } catch (err: any) {
      throw new FirebaseError(`Failed to build TypeScript functions in ${source}: ${err.message}`);
    }

    utils.logSuccess(
      `Successfully installed ${clc.bold(options.npm_package)} into functions codebase ${clc.bold(codebase)}!`,
    );
  });
