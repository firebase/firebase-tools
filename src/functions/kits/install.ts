import * as crypto from "crypto";
import * as path from "path";
import * as clc from "colorette";
import * as fs from "fs-extra";
import * as semver from "semver";

import { Config } from "../../config";
import { FirebaseError, getErrMsg } from "../../error";
import { KitFunctionConfig, FunctionsConfig } from "../../firebaseConfig";
import { getProjectId } from "../../projectUtils";
import { logLabeledBullet, logLabeledSuccess, logLabeledWarning, resolveWithin } from "../../utils";
import {
  addKitPrefix,
  isKitConfig,
  normalizeAndValidate,
  validateKit,
  validateKitInstanceId,
  ValidatedKitSingle,
  ValidatedSingle,
} from "../projectConfig";
import { logger } from "../../logger";
import { confirm, input, select } from "../../prompt";
import { spawnWithOutput, wrapSpawn } from "../../init/spawn";
import { readTemplateSync } from "../../templates";
import * as supported from "../../deploy/functions/runtimes/supported";
import * as runtimes from "../../deploy/functions/runtimes";
import * as build from "../../deploy/functions/build";
import * as params from "../../deploy/functions/params";
import * as experiments from "../../experiments";
import * as iam from "../../gcp/iam";
import * as functionsEnv from "../env";
import * as functionsConfig from "../../functionsConfig";
import { partitionUserEnvs } from "../../deploy/functions/prepare";
import { FirebaseConfig } from "../../deploy/functions/args";
import { cloneDeep } from "../../utils";
import { hasProjectEnv } from "../env";
import { RC } from "../../rc";
import { KitInstanceEnvSeed, seedKitInstanceEnv } from "./env";

export const TEMPLATES = {
  installation: "init/functions/typescript/index-kit.ts",
  migration: "init/functions/typescript/index-kit-migration.ts",
} as const;

export type TemplateType = keyof typeof TEMPLATES;
export const DEFAULT_TEMPLATE: TemplateType = "installation";

export const FUNCTION_KITS_DIR = "function-kits";

export interface ExistingFunctionsInfo {
  existingFunctions: ValidatedSingle[];
  existingKitIds: string[];
  existingCodebases: string[];
  existingInstanceIds: string[];
}

export interface ScaffoldedKitPaths {
  sourcePath: string;
  configDirPath: string;
  absSourcePath: string;
  absConfigDirPath: string;
}

export interface ScaffoldKitOptions {
  config: Config;
  kitId: string;
  instanceId: string;
  packageName: string;
  templateType?: TemplateType;
  seedEnv?: KitInstanceEnvSeed;
}

export interface AddKitInstanceOptions {
  config: Config;
  kitId: string;
  instanceId: string;
  seedEnv?: KitInstanceEnvSeed;
}

export interface AddKitInstanceResult {
  configDirPath: string;
  absConfigDirPath: string;
}

export interface ValidatedDirectoryKit {
  absDirectoryPath: string;
  relSourcePath: string;
  hasBuildScript: boolean;
}

export interface KitSource {
  defaultKitName: string;
  sourcePackageName?: string;
  hasBuildScript: boolean;
  setup: (kitId: string, instanceId: string) => Promise<ScaffoldedKitPaths>;
  buildAndInstall: (absSourcePath: string) => Promise<void>;
}

export interface InstallKitOrInstanceOptions {
  config: Config;
  package?: string;
  directory?: string;
  template?: TemplateType;
  kitId?: string;
  instanceId?: string;
  seedEnv?: KitInstanceEnvSeed;
  nonInteractive?: boolean;
  force?: boolean;
  configure?: boolean;
  project?: string;
  projectId?: string;
  rc?: RC;
}

export interface InstallKitOrInstanceResult {
  action: "installedKit" | "addedInstance" | "configuredEnv";
  kitId: string;
  instanceId?: string;
  sourcePath?: string;
  configDirPath?: string;
}

export interface PromptExistingInstanceOptions {
  existingKit: ValidatedKitSingle;
  unconfiguredInstanceIds: readonly string[];
  nonInteractive?: boolean;
  instanceId?: string;
}

export interface ExistingKitInstallOptions {
  config: Config;
  project?: string;
  projectId?: string;
  nonInteractive?: boolean;
  force?: boolean;
  configure?: boolean;
  rc?: RC;
  instanceId?: string;
  seedEnv?: KitInstanceEnvSeed;
}

export interface PromptAndWriteKitParamsOptions {
  config: Config;
  projectId?: string;
  projectAlias?: string;
  absConfigDirPath: string;
  absSourcePath: string;
  instanceId: string;
  nonInteractive?: boolean;
  force?: boolean;
  params?: params.Param[];
}

export interface PrintKitFirstDeployReportOptions {
  instanceId: string;
  absSourcePath: string;
  config?: Config;
  project?: string;
  projectId?: string;
  preDiscoveredBuild?: build.Build;
}

/**
 * Generates a unique identifier by appending a random 4-character hex suffix if a collision exists.
 * Ensures the candidate is truncated so the total length does not exceed 40 characters.
 */
export function generateUniqueId(baseId: string, existingIds: string[]): string {
  if (!existingIds.includes(baseId)) {
    return baseId;
  }
  const prefix = baseId.slice(0, 35);
  let candidate = "";
  do {
    const randomSuffix = crypto.randomBytes(2).toString("hex");
    candidate = `${prefix}-${randomSuffix}`;
  } while (existingIds.includes(candidate));
  return candidate;
}

/**
 * Parses an npm package specifier string into package name and version/tag.
 * e.g., "@firebase-function-kits/firestore-bigquery-export@1.0.0" ->
 * { packageName: "@firebase-function-kits/firestore-bigquery-export", version: "1.0.0" }
 */
export function parseNpmPackageSpecifier(rawPkg: string): {
  packageName: string;
  version?: string;
} {
  const lastAt = rawPkg.lastIndexOf("@");
  if (lastAt > 0) {
    const version = rawPkg.substring(lastAt + 1);
    return {
      packageName: rawPkg.substring(0, lastAt),
      ...(version ? { version } : {}),
    };
  }
  return { packageName: rawPkg };
}

/**
 * Validates that an npm package name adheres to npm naming conventions.
 * - Unscoped: 'name' (no slashes)
 * - Scoped: '@scope/name' (exactly one slash)
 */
export function validateNpmPackageName(packageNameOrSpecifier: string): void {
  const { packageName, version } = parseNpmPackageSpecifier(packageNameOrSpecifier);
  const npmPackageRegex = /^(?:@[a-z0-9_.-]+\/[a-z0-9_.-]+|[a-z0-9_.-]+)$/i;
  if (
    !packageName ||
    packageName.length > 214 ||
    !npmPackageRegex.test(packageName) ||
    (packageNameOrSpecifier.lastIndexOf("@") > 0 && !version)
  ) {
    throw new FirebaseError(
      `Invalid NPM package name '${packageNameOrSpecifier}'. Package names must be valid npm package specifiers (e.g. 'my-kit' or '@scope/my-kit').`,
    );
  }
}

/**
 * Sanitizes an npm package name into a valid kit identifier.
 * e.g., "@firebase-function-kits/firestore-bigquery-export" -> "firestore-bigquery-export"
 */
export function sanitizePackageNameToKitName(packageNameOrSpecifier: string): string {
  const { packageName } = parseNpmPackageSpecifier(packageNameOrSpecifier);
  const parts = packageName.split("/");
  const nameWithoutScope = parts[parts.length - 1] || packageName;
  const sanitized = nameWithoutScope.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return sanitized.slice(0, 40);
}

/**
 * Checks if a package name is third-party (outside the @firebase-function-kits scope).
 */
export function isThirdPartyPackage(packageNameOrSpecifier: string): boolean {
  const { packageName } = parseNpmPackageSpecifier(packageNameOrSpecifier);
  return !packageName.startsWith("@firebase-function-kits/");
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
 * Returns the list of instance IDs in the kit that do not have a dotenv file for the specified project.
 */
export function getUnconfiguredInstancesForProject(
  config: { path: (p: string) => string },
  kit: ValidatedKitSingle,
  projectId?: string,
  projectAlias?: string,
): string[] {
  return Object.entries(kit.instances || {})
    .filter(([, configDir]) => !hasProjectEnv(config.path(configDir), projectId, projectAlias))
    .map(([instanceId]) => instanceId);
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

  const existingKitIds: string[] = [];
  const existingCodebases: string[] = [];
  const existingInstanceIds: string[] = [];

  for (const c of existingFunctions) {
    if (isKitConfig(c)) {
      if (c.kit) {
        existingKitIds.push(c.kit);
      }
      if (c.instances) {
        existingInstanceIds.push(...Object.keys(c.instances));
      }
    } else if (c.codebase) {
      existingCodebases.push(c.codebase);
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
  existingInstanceIds: string[],
  existingCodebases: string[],
  nonInteractive?: boolean,
  customInstanceId?: string,
): Promise<string> {
  const instanceCollisions = [...existingInstanceIds, ...existingCodebases];
  const defaultInstanceId = generateUniqueId(baseKitId, instanceCollisions);

  if (customInstanceId) {
    validateKitInstanceId(customInstanceId);
    if (existingInstanceIds.includes(customInstanceId)) {
      throw new FirebaseError(
        `functions kit instance ID must be unique across all kits, but '${customInstanceId}' was used more than once.`,
      );
    }
    if (existingCodebases.includes(customInstanceId)) {
      throw new FirebaseError(
        `functions codebase name and kit instance ID must be mutually exclusive, but '${customInstanceId}' was used as both a codebase name and a kit instance ID.`,
      );
    }
    return customInstanceId;
  }

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
      if (existingInstanceIds.includes(val)) {
        return `functions kit instance ID must be unique across all kits, but '${val}' was used more than once.`;
      }
      if (existingCodebases.includes(val)) {
        return `functions codebase name and kit instance ID must be mutually exclusive, but '${val}' was used as both a codebase name and a kit instance ID.`;
      }
      return true;
    },
  });

  validateKitInstanceId(instanceId);
  if (existingInstanceIds.includes(instanceId)) {
    throw new FirebaseError(
      `functions kit instance ID must be unique across all kits, but '${instanceId}' was used more than once.`,
    );
  }
  if (existingCodebases.includes(instanceId)) {
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
  existingKitIds: string[],
  nonInteractive?: boolean,
  customKitId?: string,
): Promise<string> {
  const baseKitId = sanitizePackageNameToKitName(packageName) || "kit";
  const defaultKitId = generateUniqueId(baseKitId, existingKitIds);

  if (customKitId) {
    validateKit(customKitId);
    if (existingKitIds.includes(customKitId)) {
      throw new FirebaseError(
        `functions.kit must be unique but '${customKitId}' was used more than once.`,
      );
    }
    return customKitId;
  }

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
      if (existingKitIds.includes(val)) {
        return `functions.kit must be unique but '${val}' was used more than once.`;
      }
      return true;
    },
  });

  validateKit(kitId);
  if (existingKitIds.includes(kitId)) {
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
      `Package ${clc.bold(packageName)} is a third-party kit (outside the @firebase-function-kits scope).`,
    );
  }

  const hasShrinkwrap = await checkPackageHasShrinkwrap(rawPkgName);
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
 * Prompts the user to select an existing instance of the kit to configure for the project.
 * Restricts selection to instances that are not already configured for the project.
 */
export async function promptExistingInstanceForProject(
  options: PromptExistingInstanceOptions,
): Promise<string> {
  const allInstanceIds: string[] = Object.keys(options.existingKit.instances || {});
  if (allInstanceIds.length === 0) {
    throw new FirebaseError(`Kit '${options.existingKit.kit}' has no instances configured.`);
  }

  if (options.instanceId) {
    if (!allInstanceIds.includes(options.instanceId)) {
      throw new FirebaseError(
        `Instance '${options.instanceId}' does not exist in kit '${options.existingKit.kit}'. Available instances: ${allInstanceIds.join(", ")}`,
      );
    }
    if (!options.unconfiguredInstanceIds.includes(options.instanceId)) {
      throw new FirebaseError(
        `Instance '${options.instanceId}' is already configured for this project.`,
      );
    }
    return options.instanceId;
  }

  if (options.unconfiguredInstanceIds.length === 0) {
    throw new FirebaseError(
      `Kit '${options.existingKit.kit}' has no unconfigured instances for this project.`,
    );
  }

  if (options.unconfiguredInstanceIds.length === 1) {
    const instanceId = options.unconfiguredInstanceIds[0];
    logLabeledBullet(
      "functions",
      `${clc.bold(instanceId)} is the only instance without a configuration. Configuring...`,
    );
    return instanceId;
  }

  return select<string>({
    message: "Which instance would you like to configure for this project?",
    choices: options.unconfiguredInstanceIds,
    nonInteractive: options.nonInteractive,
  });
}

/**
 * Creates or updates package.json for a newly scaffolded kit wrapper.
 */
export async function writeKitPackageJson(
  config: Config,
  sourcePath: string,
  kitId: string,
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
    const packageKitTemplate = readTemplateSync("init/functions/typescript/package-kit.json");
    const subbedTemplate = packageKitTemplate.replace(/{{RUNTIME}}/g, latestNodeVersion);
    try {
      pkgJson = JSON.parse(subbedTemplate) as typeof pkgJson;
    } catch (err: unknown) {
      throw new FirebaseError("Failed to parse package-kit.json template: " + getErrMsg(err), {
        original: err instanceof Error ? err : undefined,
      });
    }
  }

  pkgJson.name = `${kitId}-wrapper`;

  await config.askWriteProjectFile(relPackageJsonPath, pkgJson);
}

/**
 * Creates index.ts for a newly scaffolded kit wrapper from the appropriate template.
 */
export async function writeKitIndexTs(
  config: Config,
  sourcePath: string,
  packageName: string,
  templateType: TemplateType,
): Promise<void> {
  const relIndexTsPath = path.join(sourcePath, "src", "index.ts");
  const absIndexTsPath = config.path(relIndexTsPath);
  if (!(await fs.pathExists(absIndexTsPath))) {
    const template = readTemplateSync(TEMPLATES[templateType]);
    const indexContent = template.replace(/{{PACKAGE_NAME}}/g, packageName);
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
  templateType: TemplateType = DEFAULT_TEMPLATE,
): Promise<ScaffoldedKitPaths> {
  const sourcePath = path.join(FUNCTION_KITS_DIR, kitId, "source");
  const configDirPath = path.join(FUNCTION_KITS_DIR, kitId, `config-${instanceId}`);

  const absSourcePath = config.path(sourcePath);
  const absConfigDirPath = config.path(configDirPath);

  await fs.ensureDir(absSourcePath);
  await fs.ensureDir(absConfigDirPath);

  await writeKitPackageJson(config, sourcePath, kitId);
  await config.askWriteProjectFile(
    path.join(sourcePath, "tsconfig.json"),
    readTemplateSync("init/functions/typescript/tsconfig.json"),
  );
  await config.askWriteProjectFile(
    path.join(sourcePath, ".gitignore"),
    readTemplateSync("init/functions/typescript/_gitignore"),
  );
  await writeKitIndexTs(config, sourcePath, packageName, templateType);

  return { sourcePath, configDirPath, absSourcePath, absConfigDirPath };
}

interface PackageLockEntry {
  version?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface PackageLock {
  packages?: Record<string, PackageLockEntry>;
}

interface KitManifest {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/**
 * Resolves the package specifier to save to the wrapper package.json.
 *
 * - Exact pin (e.g. "7.1.0", "=7.1.0", "v7.1.0"): Preserved as exact ("=X.Y.Z").
 * - Tilde range (e.g. "~7.1.0"): Preserved as tilde ("~installedVer" or declared).
 * - Caret / wider range (e.g. "^7.0.0", ">=7.0.0"): Anchored to caret ("^installedVer" or declared).
 */
export function resolveSdkSpecifierToSave(
  packageName: string,
  declaredVer: string,
  installedVer?: string,
): string {
  const cleanVer = semver.clean(declaredVer);
  if (cleanVer) {
    return `${packageName}@=${installedVer || cleanVer}`;
  }

  if (declaredVer.trim().startsWith("~")) {
    return installedVer ? `${packageName}@~${installedVer}` : `${packageName}@${declaredVer}`;
  }

  if (installedVer) {
    return `${packageName}@^${installedVer}`;
  }

  return `${packageName}@${declaredVer}`;
}

/**
 * Inspects package-lock.json (or node_modules as fallback) to determine which SDK versions
 * should be explicitly saved to the wrapper package.json using npm install.
 */
export async function getKitPackagesToSave(
  absSourcePath: string,
  packageName: string,
): Promise<string[]> {
  const lockfilePath = path.join(absSourcePath, "package-lock.json");

  let peerDeps: Record<string, string> = {};
  let directDeps: Record<string, string> = {};
  let installedFunctionsVer: string | undefined;
  let installedAdminVer: string | undefined;

  if (await fs.pathExists(lockfilePath)) {
    try {
      const lockfile = (await fs.readJson(lockfilePath)) as PackageLock;
      const packages = lockfile.packages || {};
      const kitEntry = packages[`node_modules/${packageName}`] || {};
      peerDeps = kitEntry.peerDependencies || {};
      directDeps = kitEntry.dependencies || {};
      installedFunctionsVer = packages["node_modules/firebase-functions"]?.version;
      installedAdminVer = packages["node_modules/firebase-admin"]?.version;
    } catch (err: unknown) {
      logger.debug(`Failed to read package-lock.json: ${getErrMsg(err)}`);
    }
  }

  if (Object.keys(peerDeps).length === 0 && Object.keys(directDeps).length === 0) {
    const kitPkgJsonPath = path.join(absSourcePath, "node_modules", packageName, "package.json");
    if (await fs.pathExists(kitPkgJsonPath)) {
      try {
        const kitPkgJson = (await fs.readJson(kitPkgJsonPath)) as KitManifest;
        peerDeps = kitPkgJson.peerDependencies || {};
        directDeps = kitPkgJson.dependencies || {};
      } catch (err: unknown) {
        logger.debug(`Failed to read kit package.json: ${getErrMsg(err)}`);
      }
    }
  }

  // 1. Resolve firebase-functions (must be declared by a valid Function Kit)
  const declaredFunctionsVer = peerDeps["firebase-functions"] || directDeps["firebase-functions"];
  if (!declaredFunctionsVer) {
    throw new FirebaseError(
      `Package '${packageName}' is not a valid Function Kit: it must declare 'firebase-functions' as a dependency or peer dependency.`,
    );
  }

  const packagesToSave: string[] = [
    resolveSdkSpecifierToSave("firebase-functions", declaredFunctionsVer, installedFunctionsVer),
  ];

  // 2. Resolve firebase-admin (strictly conditional: only if kit declared it)
  const declaredAdminVer = peerDeps["firebase-admin"] || directDeps["firebase-admin"];
  if (declaredAdminVer) {
    packagesToSave.push(
      resolveSdkSpecifierToSave("firebase-admin", declaredAdminVer, installedAdminVer),
    );
  }

  return packagesToSave;
}

/**
 * Installs dependencies and compiles TypeScript source for the kit.
 */
export async function buildAndInstallKit(
  absSourcePath: string,
  rawPkgName: string,
  isThirdParty: boolean,
): Promise<void> {
  const { packageName } = parseNpmPackageSpecifier(rawPkgName);
  const installArgs = ["install", rawPkgName, "--save-prefix=^"];
  if (isThirdParty) {
    installArgs.push("--ignore-scripts");
  }
  logLabeledBullet("functions", `Running npm ${installArgs.join(" ")}...`);
  try {
    await wrapSpawn("npm", installArgs, absSourcePath);
  } catch (err: unknown) {
    throw new FirebaseError(`NPM install failed: ${getErrMsg(err)}`);
  }

  const packagesToSave = await getKitPackagesToSave(absSourcePath, packageName);
  if (packagesToSave.length > 0) {
    logLabeledBullet(
      "functions",
      `Saving resolved SDK dependencies: ${clc.bold(packagesToSave.join(", "))}...`,
    );
    const saveArgs = ["install", ...packagesToSave, "--save-prefix=^"];
    if (isThirdParty) {
      saveArgs.push("--ignore-scripts");
    }
    try {
      await wrapSpawn("npm", saveArgs, absSourcePath);
    } catch (err: unknown) {
      throw new FirebaseError(
        `Failed to install required SDK dependencies (${packagesToSave.join(", ")}): ${getErrMsg(err)}. ` +
          "Verify that the kit's dependencies are compatible with the resolved Firebase SDK versions.",
        { original: err instanceof Error ? err : undefined },
      );
    }
  }

  logLabeledBullet("functions", "Building TypeScript source...");
  try {
    await wrapSpawn("npm", ["run", "build"], absSourcePath);
  } catch (err: unknown) {
    throw new FirebaseError(`TypeScript build failed: ${getErrMsg(err)}`);
  }
}

export interface AddKitToConfigOptions {
  kitId: string;
  instanceId: string;
  packageName?: string;
  sourcePath: string;
  configDirPath: string;
  hasBuildScript?: boolean;
}

/**
 * Appends the newly configured kit into the firebase.json configuration and saves the file.
 */
export function addKitToConfig(config: Config, options: AddKitToConfigOptions): void {
  const configSrc = config.src;
  const newKitConfig: KitFunctionConfig = {
    kit: options.kitId,
    ...(options.packageName ? { sourcePackage: { name: options.packageName } } : {}),
    source: options.sourcePath,
    instances: {
      [options.instanceId]: options.configDirPath,
    },
    ...(options.hasBuildScript ?? true
      ? { predeploy: ['npm --prefix "$RESOURCE_DIR" run build'] }
      : {}),
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

/**
 * Validates a local directory for use as a functions kit.
 * Checks that the directory exists, is a directory, and contains a valid package.json.
 */
export async function validateAndResolveDirectoryKit(
  projectDir: string,
  rawDir: string,
): Promise<ValidatedDirectoryKit> {
  const absDirectoryPath = resolveWithin(
    projectDir,
    rawDir,
    `Directory '${rawDir}' is outside of project directory. Function kit directory must be inside the project directory.`,
  );

  if (!(await fs.pathExists(absDirectoryPath))) {
    throw new FirebaseError(`Directory '${rawDir}' does not exist.`);
  }

  const stat = await fs.stat(absDirectoryPath);
  if (!stat.isDirectory()) {
    throw new FirebaseError(`Directory '${rawDir}' is not a directory.`);
  }

  const packageJsonPath = path.join(absDirectoryPath, "package.json");
  if (!(await fs.pathExists(packageJsonPath))) {
    throw new FirebaseError(
      `Directory '${rawDir}' must contain a package.json file to be installed as a function kit.`,
    );
  }

  let packageJson: { scripts?: Record<string, string> } = {};
  try {
    packageJson = (await fs.readJson(packageJsonPath)) as typeof packageJson;
  } catch (err: unknown) {
    throw new FirebaseError(`Failed to parse package.json in '${rawDir}': ${getErrMsg(err)}`);
  }

  const hasBuildScript = Boolean(packageJson.scripts && packageJson.scripts.build);

  let relSourcePath = path.relative(projectDir, absDirectoryPath);
  if (!relSourcePath) {
    relSourcePath = ".";
  }
  relSourcePath = relSourcePath.split(path.sep).join("/");

  return {
    absDirectoryPath,
    relSourcePath,
    hasBuildScript,
  };
}

/**
 * Installs dependencies and optionally compiles TypeScript source for a local directory kit.
 */
export async function buildAndInstallDirectoryKit(
  absSourcePath: string,
  hasBuildScript: boolean,
): Promise<void> {
  logLabeledBullet("functions", "Running npm install...");
  try {
    await wrapSpawn("npm", ["install"], absSourcePath);
  } catch (err: unknown) {
    throw new FirebaseError(`NPM install failed: ${getErrMsg(err)}`);
  }

  if (hasBuildScript) {
    logLabeledBullet("functions", "Building TypeScript source...");
    try {
      await wrapSpawn("npm", ["run", "build"], absSourcePath);
    } catch (err: unknown) {
      throw new FirebaseError(`TypeScript build failed: ${getErrMsg(err)}`);
    }
  }
}

/**
 * Finds a kit configuration entry in firebase.json (config.src.functions) by its kit ID.
 */
export function findKitConfig(config: Config, kitId: string): KitFunctionConfig | undefined {
  const functions = config.src.functions;
  if (!functions) {
    return undefined;
  }
  if (Array.isArray(functions)) {
    return functions.find(
      (f): f is KitFunctionConfig =>
        typeof f === "object" && f !== null && "kit" in f && f.kit === kitId,
    );
  }
  if (
    typeof functions === "object" &&
    "kit" in functions &&
    (functions as KitFunctionConfig).kit === kitId
  ) {
    return functions as KitFunctionConfig;
  }
  return undefined;
}

/**
 * Adds a new instance configuration to an existing kit in firebase.json and saves the file.
 */
export function addInstanceToKitConfig(
  config: Config,
  kitId: string,
  instanceId: string,
  configDirPath: string,
): void {
  const target = findKitConfig(config, kitId);
  if (!target) {
    throw new FirebaseError(`Kit '${kitId}' not found in firebase.json.`);
  }

  target.instances = target.instances || {};
  target.instances[instanceId] = configDirPath;
  config.writeProjectFile("firebase.json", config.src);
}

/**
 * Scaffolds a new kit and its initial instance, optionally seeds the .env.<project-id> configuration,
 * and updates firebase.json.
 */
export async function scaffoldKit(options: ScaffoldKitOptions): Promise<ScaffoldedKitPaths> {
  const paths = await scaffoldKitFiles(
    options.config,
    options.kitId,
    options.instanceId,
    options.packageName,
    options.templateType,
  );

  if (options.seedEnv?.envs && Object.keys(options.seedEnv.envs).length > 0) {
    seedKitInstanceEnv({
      configDir: paths.absConfigDirPath,
      functionsSource: paths.absSourcePath,
      projectDir: options.config.projectDir,
      projectId: options.seedEnv.projectId,
      projectAlias: options.seedEnv.projectAlias,
      envs: options.seedEnv.envs,
    });
  }

  addKitToConfig(options.config, {
    kitId: options.kitId,
    instanceId: options.instanceId,
    packageName: options.packageName,
    sourcePath: paths.sourcePath,
    configDirPath: paths.configDirPath,
  });

  return paths;
}

/**
 * Adds an instance to an existing kit, creates its configuration directory,
 * optionally seeds the .env.<project-id> configuration, and updates firebase.json.
 */
export async function addInstanceToKit(
  options: AddKitInstanceOptions,
): Promise<AddKitInstanceResult> {
  const target = findKitConfig(options.config, options.kitId);
  if (!target) {
    throw new FirebaseError(`Kit '${options.kitId}' not found in firebase.json.`);
  }

  const configDirPath = path.join(FUNCTION_KITS_DIR, options.kitId, `config-${options.instanceId}`);
  const absConfigDirPath = options.config.path(configDirPath);
  await fs.ensureDir(absConfigDirPath);

  if (options.seedEnv?.envs && Object.keys(options.seedEnv.envs).length > 0) {
    seedKitInstanceEnv({
      configDir: absConfigDirPath,
      functionsSource: options.config.path(target.source),
      projectDir: options.config.projectDir,
      projectId: options.seedEnv.projectId,
      projectAlias: options.seedEnv.projectAlias,
      envs: options.seedEnv.envs,
    });
  }

  addInstanceToKitConfig(options.config, options.kitId, options.instanceId, configDirPath);

  return { configDirPath, absConfigDirPath };
}

/**
 * Discovers the build manifest from the compiled kit source directory.
 */
export async function discoverKitBuild(
  options: { config?: Config; project?: string; projectId?: string },
  absSourcePath: string,
): Promise<build.Build> {
  const projectId = getProjectId(options) || "";
  const delegateContext: runtimes.DelegateContext = {
    projectId,
    sourceDir: absSourcePath,
    projectDir: options.config?.projectDir || "",
    runtime: supported.latest("nodejs"),
  };
  const runtimeDelegate = await runtimes.getRuntimeDelegate(delegateContext);
  return runtimeDelegate.discoverBuild({}, {});
}

/**
 * Detects missing parameters from the kit instance's dotenv files, prompts the user to fill them in,
 * and writes the resolved values into the instance's .env.<projectId> file.
 */
export async function promptAndWriteKitParams(
  options: PromptAndWriteKitParamsOptions,
): Promise<void> {
  if (!options.params || options.params.length === 0) {
    return;
  }
  if (!options.projectId) {
    logger.debug("Skipping functions kit parameter prompt: no active project ID.");
    return;
  }

  const userEnvOpt: functionsEnv.UserEnvsOpts = {
    configDir: options.absConfigDirPath,
    functionsSource: options.absSourcePath,
    projectDir: options.config.projectDir,
    projectId: options.projectId,
    projectAlias: options.projectAlias,
  };

  const rawUserEnvs = functionsEnv.loadUserEnvs(userEnvOpt);
  const { userEnvs, secretRefs } = partitionUserEnvs(rawUserEnvs);

  let firebaseConfig: FirebaseConfig = { projectId: options.projectId };
  try {
    firebaseConfig = await functionsConfig.getFirebaseConfig({ projectId: options.projectId });
  } catch (err: unknown) {
    logger.debug(
      `Could not fetch Firebase config for project ${options.projectId}: ${getErrMsg(err)}`,
    );
  }

  const typedUserEnvs = build.envWithTypes(options.params, userEnvs);
  const { paramValues: resolvedEnvs, secretRefs: resolvedSecretRefs } = await params.resolveParams(
    options.params,
    firebaseConfig,
    typedUserEnvs,
    options.instanceId,
    options.nonInteractive,
    options.force,
  );

  functionsEnv.writeResolvedParams(resolvedEnvs, userEnvs, userEnvOpt);
  if (experiments.isEnabled("secretEnvParams")) {
    functionsEnv.writeResolvedSecretRefs(resolvedSecretRefs, secretRefs, userEnvOpt);
  }
}

/**
 * Discovers kit endpoints, required APIs, and required roles, and logs a formatted report.
 */
export async function printKitFirstDeployReport(
  options: PrintKitFirstDeployReportOptions,
): Promise<void> {
  let discoveredBuild: build.Build;
  const prefix = addKitPrefix(options.instanceId);
  try {
    discoveredBuild = options.preDiscoveredBuild
      ? cloneDeep(options.preDiscoveredBuild)
      : await discoverKitBuild(options, options.absSourcePath);
    build.applyPrefix(discoveredBuild, prefix);
  } catch (err: unknown) {
    logger.debug(`Could not discover kit build for reporting: ${getErrMsg(err)}`);
    return;
  }

  const formatScopedName = (name: string): string => {
    const fullPrefix = `${prefix}-`;
    if (name.startsWith(fullPrefix)) {
      return `${fullPrefix}${clc.bold(name.slice(fullPrefix.length))}`;
    }
    return clc.bold(name);
  };

  const functions = Object.keys(discoveredBuild.endpoints).sort().map(formatScopedName);
  const taskQueues = Object.entries(discoveredBuild.endpoints)
    .filter(([, endpoint]) => build.isTaskQueueTriggered(endpoint))
    .map(([id]) => id)
    .sort()
    .map(formatScopedName);
  const channelSet = new Set<string>();
  for (const endpoint of Object.values(discoveredBuild.endpoints)) {
    if (build.isEventTriggered(endpoint) && endpoint.eventTrigger?.channel) {
      channelSet.add(endpoint.eventTrigger.channel);
    }
  }
  const eventarcChannels = Array.from(channelSet).sort();
  const apis = (discoveredBuild.requiredAPIs || []).map((a) => a.api).sort();
  const rawRoles = discoveredBuild.requiredRoles || [];
  const roles = (await Promise.all(rawRoles.map((r) => iam.getRoleName(r)))).sort();

  const printSection = (heading: string, items: string[]): void => {
    if (items.length > 0) {
      logLabeledBullet("functions", `${heading}\n` + items.map((item) => `- ${item}`).join("\n"));
    }
  };

  printSection(
    "At the first deploy, the following functions will be created in your project:",
    functions,
  );
  printSection(
    "At the first deploy, the following Task Queues will be created in your project:",
    taskQueues,
  );
  printSection(
    "At the first deploy, the following Eventarc channels will be created in your project:",
    eventarcChannels,
  );
  printSection("At the first deploy, the following APIs will be enabled in your project:", apis);
  printSection(
    "At the first deploy, the following roles will be granted to the kit service account:",
    roles,
  );

  const hasItems =
    functions.length > 0 ||
    taskQueues.length > 0 ||
    eventarcChannels.length > 0 ||
    apis.length > 0 ||
    roles.length > 0;

  if (hasItems) {
    logLabeledWarning(
      "functions",
      `${clc.bold("Please review the changes above. If you do not want them applied to your project, uninstall this kit before running firebase deploy.")}`,
    );
  }
}

/**
 * Handles installation when the kit package is already present in firebase.json.
 */
export async function addKitInstanceOrConfigureProject(
  options: ExistingKitInstallOptions,
  existingKit: ValidatedKitSingle,
  existingFunctionsInfo: ExistingFunctionsInfo,
): Promise<InstallKitOrInstanceResult> {
  const projectId = getProjectId(options) || options.projectId;
  const projectAlias =
    options.rc?.hasProjects && options.project && options.rc.hasProjectAlias(options.project)
      ? options.project
      : undefined;
  const unconfiguredInstances = getUnconfiguredInstancesForProject(
    options.config,
    existingKit,
    projectId,
    projectAlias,
  );
  const isConfiguredForProject =
    Object.keys(existingKit.instances || {}).length > 0 && unconfiguredInstances.length === 0;

  let action: "addInstance" | "addEnv";
  if (options.instanceId && existingKit.instances && options.instanceId in existingKit.instances) {
    if (!unconfiguredInstances.includes(options.instanceId)) {
      throw new FirebaseError(
        `Instance '${options.instanceId}' is already configured for this project.`,
      );
    }
    action = "addEnv";
  } else if (options.instanceId) {
    action = "addInstance";
  } else if (unconfiguredInstances.length > 0 && !options.nonInteractive) {
    const unconfiguredInstancesList = unconfiguredInstances.join(", ");
    action = await select<"addInstance" | "addEnv">({
      message: `The following instances already exist, but are not configured for this project: ${unconfiguredInstancesList}. What would you like to do?`,
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

  let resultAction: "addedInstance" | "configuredEnv";
  let instanceId: string;
  let configDirPath: string;
  let absConfigDirPath: string;

  if (action === "addInstance") {
    resultAction = "addedInstance";
    instanceId = await promptKitInstanceId(
      existingKit.kit,
      existingFunctionsInfo.existingInstanceIds,
      existingFunctionsInfo.existingCodebases,
      options.nonInteractive,
      options.instanceId,
    );

    const result = await addInstanceToKit({
      config: options.config,
      kitId: existingKit.kit,
      instanceId,
      seedEnv: options.seedEnv,
    });

    configDirPath = result.configDirPath;
    absConfigDirPath = result.absConfigDirPath;
  } else if (action === "addEnv") {
    resultAction = "configuredEnv";
    instanceId = await promptExistingInstanceForProject({
      ...options,
      existingKit,
      unconfiguredInstanceIds: unconfiguredInstances,
    });
    configDirPath = existingKit.instances[instanceId];
    if (!configDirPath) {
      throw new FirebaseError(
        `Configuration directory for instance '${instanceId}' not found in kit '${existingKit.kit}'.`,
      );
    }
    absConfigDirPath = options.config.path(configDirPath);
    if (options.seedEnv?.envs && Object.keys(options.seedEnv.envs).length > 0) {
      await fs.ensureDir(absConfigDirPath);
      seedKitInstanceEnv({
        configDir: absConfigDirPath,
        functionsSource: options.config.path(existingKit.source),
        projectDir: options.config.projectDir,
        projectId: options.seedEnv.projectId,
        projectAlias: options.seedEnv.projectAlias,
        envs: options.seedEnv.envs,
      });
    }
  } else {
    throw new FirebaseError(`Unexpected action '${String(action)}' for kit installation.`);
  }

  if (projectId) {
    fs.ensureFileSync(path.join(absConfigDirPath, `.env.${projectId}`));
  }

  const absSourcePath = options.config.path(existingKit.source);
  let discoveredBuild: build.Build | undefined;

  const shouldConfigure = options.configure !== false;
  if (shouldConfigure) {
    try {
      discoveredBuild = await discoverKitBuild(options, absSourcePath);
    } catch (err: unknown) {
      logger.debug(`Could not discover kit build for params prompting: ${getErrMsg(err)}`);
    }

    if (discoveredBuild?.params && discoveredBuild.params.length > 0) {
      await promptAndWriteKitParams({
        config: options.config,
        projectId,
        projectAlias,
        absConfigDirPath,
        absSourcePath,
        instanceId,
        nonInteractive: options.nonInteractive,
        force: options.force,
        params: discoveredBuild.params,
      });
    }
  }

  if (action === "addInstance") {
    logLabeledSuccess(
      "functions",
      `Function kit instance ${clc.bold(instanceId)} successfully added to kit ${clc.bold(existingKit.kit)}.`,
    );
  } else if (action === "addEnv") {
    const projectDisplay = projectId || options.project || "project";
    logLabeledSuccess(
      "functions",
      `Function kit instance ${clc.bold(instanceId)} successfully configured for ${clc.bold(projectDisplay)}.`,
    );
  }

  await printKitFirstDeployReport({
    config: options.config,
    project: options.project,
    projectId: options.projectId,
    instanceId,
    absSourcePath,
    preDiscoveredBuild: discoveredBuild,
  });

  return {
    action: resultAction,
    kitId: existingKit.kit,
    instanceId,
    sourcePath: existingKit.source,
    configDirPath,
  };
}

/**
 * Looks for an existing kit in the configuration matching either the npm package name or local directory source path.
 */
export function findExistingKit(
  existingFunctions: ValidatedSingle[],
  options: { package?: string; directory?: string; config: Config },
): ValidatedKitSingle | undefined {
  if (options.package) {
    const { packageName } = parseNpmPackageSpecifier(options.package);
    return existingFunctions.find(
      (c): c is ValidatedKitSingle => isKitConfig(c) && c.sourcePackage?.name === packageName,
    );
  }
  if (options.directory) {
    const absDir = path.isAbsolute(options.directory)
      ? options.directory
      : path.resolve(options.config.projectDir, options.directory);
    return existingFunctions.find(
      (c): c is ValidatedKitSingle =>
        isKitConfig(c) &&
        !c.sourcePackage &&
        path.resolve(options.config.projectDir, c.source) === absDir,
    );
  }
  return undefined;
}

/**
 * Resolves and validates an npm package kit source.
 */
export async function resolvePackageSource(
  options: InstallKitOrInstanceOptions,
): Promise<KitSource> {
  const templateType = options.template || DEFAULT_TEMPLATE;
  if (!(templateType in TEMPLATES)) {
    const validTemplates = Object.keys(TEMPLATES)
      .map((t) => `'${t}'`)
      .join(" or ");
    throw new FirebaseError(
      `Invalid template '${templateType}'. Template must be ${validTemplates}.`,
    );
  }

  const rawPkgName = options.package;
  if (!rawPkgName) {
    throw new FirebaseError("Set the --package option to a valid NPM package and try again.");
  }

  validateNpmPackageName(rawPkgName);
  const { packageName } = parseNpmPackageSpecifier(rawPkgName);

  const isThirdParty = await promptSecurityConfirmation(
    rawPkgName,
    packageName,
    options.nonInteractive,
  );

  return {
    defaultKitName: packageName,
    sourcePackageName: packageName,
    hasBuildScript: true,
    setup: (kitId: string, instanceId: string) =>
      scaffoldKitFiles(options.config, kitId, instanceId, packageName, templateType),
    buildAndInstall: (absSourcePath: string) =>
      buildAndInstallKit(absSourcePath, rawPkgName, isThirdParty),
  };
}

/**
 * Resolves and validates a local directory kit source.
 */
export async function resolveDirectorySource(
  options: InstallKitOrInstanceOptions,
): Promise<KitSource> {
  if (!options.directory) {
    throw new FirebaseError("Must specify --directory.");
  }

  const { absDirectoryPath, relSourcePath, hasBuildScript } = await validateAndResolveDirectoryKit(
    options.config.projectDir,
    options.directory,
  );

  return {
    defaultKitName: path.basename(absDirectoryPath),
    sourcePackageName: undefined,
    hasBuildScript,
    setup: async (kitId: string, instanceId: string) => {
      const configDirPath = path.join(FUNCTION_KITS_DIR, kitId, `config-${instanceId}`);
      const absConfigDirPath = options.config.path(configDirPath);
      await fs.ensureDir(absConfigDirPath);
      return {
        sourcePath: relSourcePath,
        configDirPath,
        absSourcePath: absDirectoryPath,
        absConfigDirPath,
      };
    },
    buildAndInstall: (absSourcePath: string) =>
      buildAndInstallDirectoryKit(absSourcePath, hasBuildScript),
  };
}

/**
 * Orchestrates the complete kit installation flow.
 * Installs a brand new kit (from package or directory) or adds a new instance to an existing kit.
 */
export async function installKitOrInstance(
  options: InstallKitOrInstanceOptions,
): Promise<InstallKitOrInstanceResult> {
  if (options.package && options.directory) {
    throw new FirebaseError("Cannot specify both --package and --directory. Please choose one.");
  }
  if (!options.package && !options.directory) {
    throw new FirebaseError("Must specify either --package or --directory.");
  }
  if (options.directory && options.template) {
    throw new FirebaseError("Cannot specify --template with --directory.");
  }

  const existingFunctionsInfo = extractExistingFunctionsInfo(options.config.src.functions);
  const existingKit = findExistingKit(existingFunctionsInfo.existingFunctions, options);
  if (existingKit) {
    return addKitInstanceOrConfigureProject(options, existingKit, existingFunctionsInfo);
  }

  const source = options.directory
    ? await resolveDirectorySource(options)
    : await resolvePackageSource(options);

  const kitId = await promptKitId(
    source.defaultKitName,
    existingFunctionsInfo.existingKitIds,
    options.nonInteractive,
    options.kitId,
  );

  const instanceId = await promptKitInstanceId(
    kitId,
    existingFunctionsInfo.existingInstanceIds,
    existingFunctionsInfo.existingCodebases,
    options.nonInteractive,
    options.instanceId,
  );

  const { sourcePath, configDirPath, absSourcePath, absConfigDirPath } = await source.setup(
    kitId,
    instanceId,
  );

  if (options.seedEnv?.envs && Object.keys(options.seedEnv.envs).length > 0) {
    seedKitInstanceEnv({
      configDir: absConfigDirPath,
      functionsSource: absSourcePath,
      projectDir: options.config.projectDir,
      projectId: options.seedEnv.projectId,
      projectAlias: options.seedEnv.projectAlias,
      envs: options.seedEnv.envs,
    });
  }

  await source.buildAndInstall(absSourcePath);

  const projectId = getProjectId(options) || options.projectId;
  const projectAlias =
    options.rc?.hasProjects && options.project && options.rc.hasProjectAlias(options.project)
      ? options.project
      : undefined;

  if (projectId) {
    fs.ensureFileSync(path.join(absConfigDirPath, `.env.${projectId}`));
  }

  let discoveredBuild: build.Build | undefined;

  const shouldConfigure = options.configure !== false;
  if (shouldConfigure) {
    try {
      discoveredBuild = await discoverKitBuild(options, absSourcePath);
    } catch (err: unknown) {
      logger.debug(`Could not discover kit build for params prompting: ${getErrMsg(err)}`);
    }

    if (discoveredBuild?.params && discoveredBuild.params.length > 0) {
      await promptAndWriteKitParams({
        config: options.config,
        projectId,
        projectAlias,
        absConfigDirPath,
        absSourcePath,
        instanceId,
        nonInteractive: options.nonInteractive,
        force: options.force,
        params: discoveredBuild.params,
      });
    }
  }

  addKitToConfig(options.config, {
    kitId,
    instanceId,
    packageName: source.sourcePackageName,
    sourcePath,
    configDirPath,
    hasBuildScript: source.hasBuildScript,
  });

  logLabeledSuccess("functions", `Function kit ${clc.bold(kitId)} successfully installed.`);
  await printKitFirstDeployReport({
    config: options.config,
    project: options.project,
    projectId: options.projectId,
    instanceId,
    absSourcePath,
    preDiscoveredBuild: discoveredBuild,
  });

  return {
    action: "installedKit",
    kitId,
    instanceId,
    sourcePath,
    configDirPath,
  };
}
