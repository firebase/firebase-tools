import * as clc from "colorette";
import * as crypto from "crypto";
import * as path from "path";
import * as fs from "fs-extra";

import { Command } from "../command";
import { FirebaseError, getErrMsg } from "../error";
import { KitFunctionConfig, FunctionsConfig } from "../firebaseConfig";
import { getProjectId } from "../projectUtils";
import { logLabeledBullet, logLabeledSuccess, logLabeledWarning } from "../utils";

import {
  isKitConfig,
  normalizeAndValidate,
  validateKit,
  validateKitInstanceId,
  ValidatedKitSingle,
  ValidatedSingle,
} from "../functions/projectConfig";
import * as experiments from "../experiments";
import { logger } from "../logger";
import { Options } from "../options";
import { confirm, input, select } from "../prompt";
import { spawnWithOutput, wrapSpawn } from "../init/spawn";
import { readTemplateSync } from "../templates";
import * as supported from "../deploy/functions/runtimes/supported";
import { hasProjectEnv } from "../functions/env";
import * as self from "./functions-kits-install";
import { Config } from "../config";

const PACKAGE_NO_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/typescript/package.nolint.json",
);
const TSCONFIG_TEMPLATE = readTemplateSync("init/functions/typescript/tsconfig.json");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/typescript/_gitignore");
const INDEX_KIT_TEMPLATE = readTemplateSync("init/functions/typescript/index-kit.ts");
const INDEX_KIT_MIGRATION_TEMPLATE = readTemplateSync(
  "init/functions/typescript/index-kit-migration.ts",
);

export const TEMPLATES = {
  installation: INDEX_KIT_TEMPLATE,
  migration: INDEX_KIT_MIGRATION_TEMPLATE,
};

export type TemplateType = keyof typeof TEMPLATES;
export const DEFAULT_TEMPLATE: TemplateType = "installation";

export const FUNCTION_KITS_DIR = "function-kits";

export interface FunctionsKitsInstallOptions extends Options {
  npm_package?: string;
  template?: string;
}

export interface ExistingFunctionsInfo {
  existingFunctions: ValidatedSingle[];
  existingKitIds: Set<string>;
  existingCodebases: Set<string>;
  existingInstanceIds: Set<string>;
}

export interface ScaffoldedKitPaths {
  sourcePath: string;
  configDirPath: string;
  absSourcePath: string;
}

/**
 * Generates a unique identifier by appending a random 4-character hex suffix if a collision exists.
 * Ensures the candidate is truncated so the total length does not exceed 40 characters.
 */
export function generateUniqueId(baseId: string, existingIds: Set<string>): string {
  if (!existingIds.has(baseId)) {
    return baseId;
  }
  const prefix = baseId.slice(0, 35);
  let candidate = "";
  do {
    const randomSuffix = crypto.randomBytes(2).toString("hex");
    candidate = `${prefix}-${randomSuffix}`;
  } while (existingIds.has(candidate));
  return candidate;
}

/**
 * Parses an npm package specifier string into package name and version/tag.
 * e.g., "@firebase-functions-kits/firestore-bigquery-export@1.0.0" ->
 * { packageName: "@firebase-functions-kits/firestore-bigquery-export", version: "1.0.0" }
 */
export function parseNpmPackageSpecifier(rawPkg: string): {
  packageName: string;
  version?: string;
} {
  const lastAt = rawPkg.lastIndexOf("@");
  if (lastAt > 0) {
    return {
      packageName: rawPkg.substring(0, lastAt),
      version: rawPkg.substring(lastAt + 1),
    };
  }
  return { packageName: rawPkg };
}

/**
 * Validates that an npm package name adheres to npm naming conventions.
 * - Unscoped: 'name' (no slashes)
 * - Scoped: '@scope/name' (exactly one slash)
 */
export function validateNpmPackageName(packageName: string): void {
  const npmPackageRegex = /^(?:@[a-z0-9_.-]+\/[a-z0-9_.-]+|[a-z0-9_.-]+)$/i;
  if (!packageName || packageName.length > 214 || !npmPackageRegex.test(packageName)) {
    throw new FirebaseError(
      `Invalid NPM package name '${packageName}'. Package names must be valid npm package specifiers (e.g. 'my-kit' or '@scope/my-kit').`,
    );
  }
}

/**
 * Sanitizes an npm package name into a valid kit identifier.
 * e.g., "@firebase-functions-kits/firestore-bigquery-export" -> "firestore-bigquery-export"
 */
export function sanitizePackageNameToKitName(packageName: string): string {
  const parts = packageName.split("/");
  const nameWithoutScope = parts[parts.length - 1] || packageName;
  const sanitized = nameWithoutScope.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return sanitized.slice(0, 40);
}

/**
 * Checks if a package name is third-party (outside the @firebase-functions-kits scope).
 */
export function isThirdPartyPackage(packageName: string): boolean {
  return !packageName.startsWith("@firebase-functions-kits/");
}

/**
 * Checks if an NPM package contains an npm-shrinkwrap.json file.
 */
export async function checkPackageHasShrinkwrap(rawPkgName: string): Promise<boolean> {
  try {
    const output = await spawnWithOutput("npm", ["pack", rawPkgName, "--dry-run", "--json"]);
    const parsed = JSON.parse(output) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      const pkgInfo = parsed[0] as {
        hasShrinkwrap?: boolean;
        files?: Array<{ path?: string }>;
      };
      if (pkgInfo.hasShrinkwrap) {
        return true;
      }
      if (Array.isArray(pkgInfo.files)) {
        return pkgInfo.files.some(
          (f) => f.path === "npm-shrinkwrap.json" || f.path === "npm-shrinkwrap.js",
        );
      }
    }
  } catch (err: unknown) {
    logger.debug(`Failed to inspect package shrinkwrap for ${rawPkgName}: ${getErrMsg(err)}`);
  }
  return false;
}

/**
 * Checks if any of the kit's instance configuration directories contain a dotenv file for the current project.
 */
export function isKitConfiguredForProject(
  config: { path: (p: string) => string },
  kit: ValidatedKitSingle,
  projectId?: string,
  projectAlias?: string,
): boolean {
  return Object.values(kit.instances || {}).some((configDir) =>
    hasProjectEnv(config.path(configDir), projectId, projectAlias),
  );
}

/**
 * Extracts and categorizes existing functions, kit IDs, instance IDs, and codebase names from configuration.
 */
export function extractExistingFunctionsInfo(
  configFunctions?: FunctionsConfig,
): ExistingFunctionsInfo {
  const existingFunctions: ValidatedSingle[] =
    configFunctions && (!Array.isArray(configFunctions) || configFunctions.length > 0)
      ? normalizeAndValidate(configFunctions)
      : [];

  const existingKitIds = new Set<string>();
  const existingCodebases = new Set<string>();
  const existingInstanceIds = new Set<string>();

  for (const c of existingFunctions) {
    if (isKitConfig(c)) {
      if (c.kit) {
        existingKitIds.add(c.kit);
      }
      if (c.instances) {
        for (const instId of Object.keys(c.instances)) {
          existingInstanceIds.add(instId);
        }
      }
    } else if (c.codebase) {
      existingCodebases.add(c.codebase);
    }
  }

  return {
    existingFunctions,
    existingKitIds,
    existingCodebases,
    existingInstanceIds,
  };
}

/**
 * Prompts the user for a kit instance ID with validation against collision with existing instance IDs and codebase names.
 */
export async function promptKitInstanceId(
  baseKitId: string,
  existingInstanceIds: Set<string>,
  existingCodebases: Set<string>,
  nonInteractive?: boolean,
): Promise<string> {
  const instanceCollisions = new Set([...existingInstanceIds, ...existingCodebases]);
  const defaultInstanceId = generateUniqueId(baseKitId, instanceCollisions);

  const instanceId = await input({
    message: "What would you like to name this instance?",
    default: defaultInstanceId,
    nonInteractive,
    validate: (val: string) => {
      try {
        validateKitInstanceId(val);
      } catch (err: unknown) {
        return getErrMsg(err);
      }
      if (existingInstanceIds.has(val)) {
        return `functions kit instance ID must be unique across all kits, but '${val}' was used more than once.`;
      }
      if (existingCodebases.has(val)) {
        return `functions codebase name and kit instance ID must be mutually exclusive, but '${val}' was used as both a codebase name and a kit instance ID.`;
      }
      return true;
    },
  });

  validateKitInstanceId(instanceId);
  if (existingInstanceIds.has(instanceId)) {
    throw new FirebaseError(
      `functions kit instance ID must be unique across all kits, but '${instanceId}' was used more than once.`,
    );
  }
  if (existingCodebases.has(instanceId)) {
    throw new FirebaseError(
      `functions codebase name and kit instance ID must be mutually exclusive, but '${instanceId}' was used as both a codebase name and a kit instance ID.`,
    );
  }

  return instanceId;
}

/**
 * Prompts the user for a kit ID with validation against existing kit IDs.
 */
export async function promptKitId(
  packageName: string,
  existingKitIds: Set<string>,
  nonInteractive?: boolean,
): Promise<string> {
  const baseKitId = sanitizePackageNameToKitName(packageName);
  const defaultKitId = generateUniqueId(baseKitId, existingKitIds);

  const kitId = await input({
    message: "What would you like to name this kit?",
    default: defaultKitId,
    nonInteractive,
    validate: (val: string) => {
      try {
        validateKit(val);
      } catch (err: unknown) {
        return getErrMsg(err);
      }
      if (existingKitIds.has(val)) {
        return `functions.kit must be unique but '${val}' was used more than once.`;
      }
      return true;
    },
  });

  validateKit(kitId);
  if (existingKitIds.has(kitId)) {
    throw new FirebaseError(`functions.kit must be unique but '${kitId}' was used more than once.`);
  }

  return kitId;
}

/**
 * Warns about third-party packages or missing shrinkwrap, and prompts for user confirmation before installation.
 */
export async function promptSecurityConfirmation(
  rawPkgName: string,
  packageName: string,
  nonInteractive?: boolean,
): Promise<boolean> {
  const isThirdParty = isThirdPartyPackage(packageName);
  if (isThirdParty) {
    logLabeledWarning(
      "functions",
      `Package ${clc.bold(packageName)} is a third-party kit (outside the @firebase-functions-kits scope).`,
    );
  }

  const hasShrinkwrap = await self.checkPackageHasShrinkwrap(rawPkgName);
  if (!hasShrinkwrap) {
    logLabeledWarning(
      "functions",
      `Package ${clc.bold(packageName)} does not have an npm-shrinkwrap.json file. npm-shrinkwrap guarantees that you deploy the same version of dependencies that the publisher tested against. Since this kit does not have an npm-shrinkwrap, it is possible that deploys or updates may introduce bugs or vulnerabilities in newer dependency versions that the publisher did not test against.`,
    );
  }

  if (isThirdParty || !hasShrinkwrap) {
    let confirmMessage: string;
    if (isThirdParty && !hasShrinkwrap) {
      confirmMessage = `Are you sure you want to install the third-party kit ${packageName} without locked dependencies?`;
    } else if (isThirdParty) {
      confirmMessage = `Are you sure you want to install the third-party kit ${packageName}?`;
    } else {
      confirmMessage = `Are you sure you want to install ${packageName} without locked dependencies?`;
    }
    const confirmInstallation = await confirm({
      message: confirmMessage,
      default: false,
      nonInteractive,
    });
    if (!confirmInstallation) {
      throw new FirebaseError("Installation cancelled.");
    }
  }

  return isThirdParty;
}

/**
 * Adds a new instance to an existing kit in firebase.json.
 */
async function addInstanceToExistingKit(
  options: FunctionsKitsInstallOptions,
  existingKit: ValidatedKitSingle,
  existingFunctionsInfo: ExistingFunctionsInfo,
): Promise<void> {
  const instanceId = await promptKitInstanceId(
    existingKit.kit,
    existingFunctionsInfo.existingInstanceIds,
    existingFunctionsInfo.existingCodebases,
    options.nonInteractive,
  );

  const configDirPath = path.join(FUNCTION_KITS_DIR, existingKit.kit, `config-${instanceId}`);
  const absConfigDirPath = options.config.path(configDirPath);
  await fs.ensureDir(absConfigDirPath);

  existingKit.instances[instanceId] = configDirPath;

  options.config.writeProjectFile("firebase.json", options.config.src);
  logLabeledSuccess(
    "functions",
    `Function kit instance ${clc.bold(instanceId)} successfully added to kit ${clc.bold(existingKit.kit)}.`,
  );
}

/**
 * Guides the user on configuring an existing instance for the active project.
 */
export async function promptExistingInstanceForProject(
  options: FunctionsKitsInstallOptions,
  existingKit: ValidatedKitSingle,
): Promise<void> {
  const instanceIds: string[] = Object.keys(existingKit.instances);
  if (instanceIds.length === 0) {
    throw new FirebaseError(`Kit '${existingKit.kit}' has no instances configured.`);
  }

  let selectedInstanceId = "<instance-name>";
  if (instanceIds.length === 1) {
    selectedInstanceId = instanceIds[0];
  } else if (!options.nonInteractive) {
    selectedInstanceId = await select<string>({
      message: "Which instance would you like to configure for this project?",
      choices: instanceIds.map((id) => ({ name: id, value: id })),
    });
  }

  const targetProject = getProjectId(options) || options.project || "<project-name>";
  logLabeledBullet(
    "functions",
    `To create a new instance in this project, deploy the instance dedicated to this project using\n` +
      clc.bold(`firebase deploy --only functions:${selectedInstanceId} --project ${targetProject}`),
  );
}

/**
 * Handles installation when the kit package is already present in firebase.json.
 */
export async function addKitInstanceOrConfigureProject(
  options: FunctionsKitsInstallOptions,
  existingKit: ValidatedKitSingle,
  existingFunctionsInfo: ExistingFunctionsInfo,
): Promise<void> {
  const projectId = getProjectId(options);
  const projectAlias =
    options.rc?.hasProjects && options.project && options.rc.hasProjectAlias(options.project)
      ? options.project
      : undefined;
  const isConfiguredForProject = isKitConfiguredForProject(
    options.config,
    existingKit,
    projectId,
    projectAlias,
  );

  let action: "addInstance" | "addEnv";
  if (!isConfiguredForProject && !options.nonInteractive) {
    const existingInstances = Object.keys(existingKit.instances || {}).join(", ");
    action = await select<"addInstance" | "addEnv">({
      message: `The following instances already exist, but are not configured for this project: ${existingInstances}. What would you like to do?`,
      choices: [
        {
          name: "Add an instance to the existing kit",
          value: "addInstance",
        },
        {
          name: "Configure an existing instance for this project",
          value: "addEnv",
        },
      ],
    });
  } else {
    if (isConfiguredForProject) {
      logLabeledBullet(
        "functions",
        `This package is already installed as kit ${existingKit.kit}, creating a new instance.`,
      );
    }
    action = "addInstance";
  }

  if (action === "addInstance") {
    await addInstanceToExistingKit(options, existingKit, existingFunctionsInfo);
    return;
  }

  if (action === "addEnv") {
    await promptExistingInstanceForProject(options, existingKit);
    return;
  }
}

/**
 * Creates or updates package.json for a newly scaffolded kit wrapper.
 */
async function writeKitPackageJson(
  config: Config,
  sourcePath: string,
  kitId: string,
  packageName: string,
  version?: string,
): Promise<void> {
  const relPackageJsonPath = path.join(sourcePath, "package.json");
  const absPackageJsonPath = config.path(relPackageJsonPath);
  let pkgJson: {
    name?: string;
    version?: string;
    main?: string;
    scripts?: Record<string, string>;
    engines?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    private?: boolean;
  } = {};

  if (await fs.pathExists(absPackageJsonPath)) {
    try {
      pkgJson = (await fs.readJson(absPackageJsonPath)) as typeof pkgJson;
    } catch (err: unknown) {
      logger.debug(`Failed to read existing package.json: ${getErrMsg(err)}`);
    }
  } else {
    const latestNodeVersion = supported.latest("nodejs").replace("nodejs", "");
    const subbedTemplate = PACKAGE_NO_LINTING_TEMPLATE.replace("{{RUNTIME}}", latestNodeVersion);
    try {
      pkgJson = JSON.parse(subbedTemplate) as typeof pkgJson;
    } catch (err: unknown) {
      throw new FirebaseError("Failed to parse package.nolint.json template: " + getErrMsg(err));
    }
  }

  // Ensure the wrapper package has a unique name and depends on the specified kit package and version.
  pkgJson.name = `${kitId}-wrapper`;
  pkgJson.dependencies = pkgJson.dependencies || {};
  pkgJson.dependencies[packageName] = version || "latest";

  await config.askWriteProjectFile(relPackageJsonPath, pkgJson);
}

/**
 * Creates index.ts for a newly scaffolded kit wrapper from the appropriate template.
 */
async function writeKitIndexTs(
  config: Config,
  sourcePath: string,
  packageName: string,
  templateType: TemplateType,
): Promise<void> {
  const relIndexTsPath = path.join(sourcePath, "src", "index.ts");
  const absIndexTsPath = config.path(relIndexTsPath);
  if (!(await fs.pathExists(absIndexTsPath))) {
    const template = TEMPLATES[templateType];
    const indexContent = template.replace("{{PACKAGE_NAME}}", packageName);
    await config.askWriteProjectFile(relIndexTsPath, indexContent);
  }
}

/**
 * Scaffolds the kit directory structure, package.json, tsconfig, gitignore, and index.ts source files.
 */
export async function scaffoldKitFiles(
  config: Config,
  kitId: string,
  instanceId: string,
  packageName: string,
  version?: string,
  templateType: TemplateType = DEFAULT_TEMPLATE,
): Promise<ScaffoldedKitPaths> {
  const sourcePath = path.join(FUNCTION_KITS_DIR, kitId, "source");
  const configDirPath = path.join(FUNCTION_KITS_DIR, kitId, `config-${instanceId}`);

  const absSourcePath = config.path(sourcePath);
  const absConfigDirPath = config.path(configDirPath);

  await fs.ensureDir(absSourcePath);
  await fs.ensureDir(absConfigDirPath);

  await writeKitPackageJson(config, sourcePath, kitId, packageName, version);
  await config.askWriteProjectFile(path.join(sourcePath, "tsconfig.json"), TSCONFIG_TEMPLATE);
  await config.askWriteProjectFile(path.join(sourcePath, ".gitignore"), GITIGNORE_TEMPLATE);
  await writeKitIndexTs(config, sourcePath, packageName, templateType);

  return { sourcePath, configDirPath, absSourcePath };
}

/**
 * Installs dependencies and compiles TypeScript source for the kit.
 */
export async function buildAndInstallKit(
  absSourcePath: string,
  isThirdParty: boolean,
): Promise<void> {
  const installArgs = isThirdParty ? ["install", "--ignore-scripts"] : ["install"];
  logLabeledBullet("functions", `Running npm ${installArgs.join(" ")}...`);
  try {
    await wrapSpawn("npm", installArgs, absSourcePath);
  } catch (err: unknown) {
    throw new FirebaseError(`NPM install failed: ${getErrMsg(err)}`);
  }

  logLabeledBullet("functions", "Building TypeScript source...");
  try {
    await wrapSpawn("npm", ["run", "build"], absSourcePath);
  } catch (err: unknown) {
    throw new FirebaseError(`TypeScript build failed: ${getErrMsg(err)}`);
  }
}

/**
 * Appends the newly configured kit into the firebase.json configuration and saves the file.
 */
export function addKitToConfig(
  config: Config,
  kitId: string,
  instanceId: string,
  packageName: string,
  sourcePath: string,
  configDirPath: string,
): void {
  const configSrc = config.src;
  const newKitConfig: KitFunctionConfig = {
    kit: kitId,
    sourcePackage: {
      name: packageName,
    },
    source: sourcePath,
    instances: {
      [instanceId]: configDirPath,
    },
    predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
  };

  const functionsRaw = configSrc.functions as KitFunctionConfig | KitFunctionConfig[] | undefined;
  if (!functionsRaw) {
    configSrc.functions = [newKitConfig];
  } else if (Array.isArray(functionsRaw)) {
    functionsRaw.push(newKitConfig);
  } else {
    configSrc.functions = [functionsRaw, newKitConfig];
  }

  config.writeProjectFile("firebase.json", configSrc);
}

export const command = new Command("functions:kits:install")
  .description("install a function kit into your project")
  .option("--npm_package <package>", "NPM package name or specifier to install as a function kit")
  .option(
    `--template [${Object.keys(TEMPLATES).join("|")}]`,
    "template to use for the kit index file",
    DEFAULT_TEMPLATE,
  )
  .action(async (options: FunctionsKitsInstallOptions): Promise<void> => {
    experiments.assertEnabled("kits", "install a function kit");

    if (!options.config) {
      throw new FirebaseError("Not in a Firebase project directory (firebase.json not found).");
    }

    const templateType = (options.template || DEFAULT_TEMPLATE) as TemplateType;
    if (!(templateType in TEMPLATES)) {
      const validTemplates = Object.keys(TEMPLATES)
        .map((t) => `'${t}'`)
        .join(" or ");
      throw new FirebaseError(
        `Invalid template '${templateType}'. Template must be ${validTemplates}.`,
      );
    }

    const rawPkgName = options.npm_package;
    if (!rawPkgName) {
      throw new FirebaseError("set the --npm_package option to a valid NPM package and try again.");
    }

    const { packageName, version } = parseNpmPackageSpecifier(rawPkgName);
    validateNpmPackageName(packageName);

    const existingFunctionsInfo = extractExistingFunctionsInfo(options.config.src.functions);
    const existingKit = existingFunctionsInfo.existingFunctions.find(
      (c): c is ValidatedKitSingle => isKitConfig(c) && c.sourcePackage?.name === packageName,
    );

    if (existingKit) {
      await addKitInstanceOrConfigureProject(options, existingKit, existingFunctionsInfo);
      return;
    }

    const isThirdParty = await promptSecurityConfirmation(
      rawPkgName,
      packageName,
      options.nonInteractive,
    );

    const kitId = await promptKitId(
      packageName,
      existingFunctionsInfo.existingKitIds,
      options.nonInteractive,
    );

    const instanceId = await promptKitInstanceId(
      kitId,
      existingFunctionsInfo.existingInstanceIds,
      existingFunctionsInfo.existingCodebases,
      options.nonInteractive,
    );

    const { sourcePath, configDirPath, absSourcePath } = await scaffoldKitFiles(
      options.config,
      kitId,
      instanceId,
      packageName,
      version,
      templateType,
    );

    await buildAndInstallKit(absSourcePath, isThirdParty);

    addKitToConfig(options.config, kitId, instanceId, packageName, sourcePath, configDirPath);

    logLabeledSuccess("functions", `Function kit ${clc.bold(kitId)} successfully installed.`);
  });
