import * as crypto from "crypto";
import * as path from "path";
import * as fs from "fs-extra";

import { Config } from "../../config";
import { FirebaseError, getErrMsg } from "../../error";
import { KitFunctionConfig, FunctionsConfig } from "../../firebaseConfig";
import { getProjectId } from "../../projectUtils";
import { logLabeledBullet } from "../../utils";
import {
  isKitConfig,
  normalizeAndValidate,
  ValidatedKitSingle,
  ValidatedSingle,
} from "../projectConfig";
import { logger } from "../../logger";
import { spawnWithOutput, wrapSpawn } from "../../init/spawn";
import { readTemplateSync } from "../../templates";
import * as supported from "../../deploy/functions/runtimes/supported";
import * as runtimes from "../../deploy/functions/runtimes";
import * as build from "../../deploy/functions/build";
import { hasProjectEnv } from "../env";
import { KitInstanceEnvSeed, seedKitInstanceEnv } from "./env";

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
  absConfigDirPath: string;
}

export interface ScaffoldKitOptions {
  config: Config;
  kitId: string;
  instanceId: string;
  packageName: string;
  version?: string;
  templateType?: TemplateType;
  seedEnv?: KitInstanceEnvSeed;
}

export interface AddKitInstanceOptions {
  config: Config;
  kit: ValidatedKitSingle;
  instanceId: string;
  seedEnv?: KitInstanceEnvSeed;
}

export interface AddKitInstanceResult {
  configDirPath: string;
  absConfigDirPath: string;
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
 * Creates or updates package.json for a newly scaffolded kit wrapper.
 */
export async function writeKitPackageJson(
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

  pkgJson.name = `${kitId}-wrapper`;
  pkgJson.dependencies = pkgJson.dependencies || {};
  pkgJson.dependencies[packageName] = version || "latest";

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

  return { sourcePath, configDirPath, absSourcePath, absConfigDirPath };
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

/**
 * Adds a new instance configuration to an existing kit in firebase.json and saves the file.
 */
export function addInstanceToKitConfig(
  config: Config,
  existingKit: ValidatedKitSingle,
  instanceId: string,
  configDirPath: string,
): void {
  existingKit.instances = existingKit.instances || {};
  existingKit.instances[instanceId] = configDirPath;
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
    options.version,
    options.templateType,
  );

  if (options.seedEnv?.envs && Object.keys(options.seedEnv.envs).length > 0) {
    seedKitInstanceEnv({
      configDir: paths.absConfigDirPath,
      functionsSource: paths.absSourcePath,
      projectDir: options.config.projectDir,
      projectId: options.seedEnv.projectId || "",
      projectAlias: options.seedEnv.projectAlias,
      envs: options.seedEnv.envs,
    });
  }

  addKitToConfig(
    options.config,
    options.kitId,
    options.instanceId,
    options.packageName,
    paths.sourcePath,
    paths.configDirPath,
  );

  return paths;
}

/**
 * Adds an instance to an existing kit, creates its configuration directory,
 * optionally seeds the .env.<project-id> configuration, and updates firebase.json.
 */
export async function addInstanceToKit(
  options: AddKitInstanceOptions,
): Promise<AddKitInstanceResult> {
  const configDirPath = path.join(FUNCTION_KITS_DIR, options.kit.kit, `config-${options.instanceId}`);
  const absConfigDirPath = options.config.path(configDirPath);
  await fs.ensureDir(absConfigDirPath);

  if (options.seedEnv?.envs && Object.keys(options.seedEnv.envs).length > 0) {
    seedKitInstanceEnv({
      configDir: absConfigDirPath,
      functionsSource: options.config.path(options.kit.source),
      projectDir: options.config.projectDir,
      projectId: options.seedEnv.projectId || "",
      projectAlias: options.seedEnv.projectAlias,
      envs: options.seedEnv.envs,
    });
  }

  addInstanceToKitConfig(options.config, options.kit, options.instanceId, configDirPath);

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
