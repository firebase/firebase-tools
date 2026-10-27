import * as path from "path";
import * as clc from "colorette";
import * as fs from "fs-extra";
import * as semver from "semver";

import { Config } from "../../../config";
import { FirebaseError, getErrMsg } from "../../../error";
import { spawnWithOutput, wrapSpawn } from "../../../init/spawn";
import { logger } from "../../../logger";
import { confirm } from "../../../prompt";
import { readTemplateSync } from "../../../templates";
import { logLabeledBullet, logLabeledWarning } from "../../../utils";
import * as supported from "../../../deploy/functions/runtimes/supported";
import { isKitConfig, ValidatedKitSingle, ValidatedSingle } from "../../projectConfig";
import { FUNCTION_KITS_DIR, KitSourceAdapter, PreparedKitSource, sanitizeToKitId } from "./types";

export const TEMPLATES = {
  installation: "init/functions/typescript/index-kit.ts",
  migration: "init/functions/typescript/index-kit-migration.ts",
} as const;

export type TemplateType = keyof typeof TEMPLATES;
export const DEFAULT_TEMPLATE: TemplateType = "installation";

export interface PromptSecurityConfirmationOptions {
  rawPkgName: string;
  packageName: string;
  nonInteractive?: boolean;
  force?: boolean;
}

export interface ScaffoldedKitPaths {
  sourcePath: string;
  configDirPath: string;
  absSourcePath: string;
  absConfigDirPath: string;
}

export interface WriteKitIndexTsOptions {
  config: Config;
  sourcePath: string;
  packageName: string;
  templateType: TemplateType;
}

export interface NpmPackageAdapterOptions {
  config: Config;
  package: string;
  template?: TemplateType;
  nonInteractive?: boolean;
  force?: boolean;
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
 * Validates that an npm package name or specifier adheres to npm naming conventions.
 * - Unscoped: 'name' (no slashes)
 * - Scoped: '@scope/name' (exactly one slash)
 * Supports optional version or tag suffix (e.g. '@1.2.3' or '@next').
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
 * Validates that an npm package or package@version specifier has a valid name format
 * and exists in the npm registry.
 */
export async function validateNpmPackageExists(rawPkgName: string): Promise<void> {
  validateNpmPackageName(rawPkgName);
  try {
    const output = await spawnWithOutput("npm", ["view", rawPkgName, "version"]);
    if (!output.trim()) {
      throw new Error(`No version found for '${rawPkgName}'`);
    }
  } catch (err: unknown) {
    throw new FirebaseError(
      `NPM package '${rawPkgName}' could not be found in the npm registry. Please verify the package name and version.`,
      { original: err instanceof Error ? err : undefined },
    );
  }
}

/**
 * Sanitizes an npm package name or specifier into a valid kit identifier.
 * e.g., "@firebase-function-kits/firestore-bigquery-export@1.0.0" -> "firestore-bigquery-export"
 * e.g., "my-kit@next" -> "my-kit"
 */
export function sanitizePackageNameToKitName(packageNameOrSpecifier: string): string {
  const { packageName } = parseNpmPackageSpecifier(packageNameOrSpecifier);
  const parts = packageName.split("/");
  const nameWithoutScope = parts[parts.length - 1] || packageName;
  return sanitizeToKitId(nameWithoutScope);
}

/**
 * Checks if a package name or specifier is third-party (outside the @firebase-function-kits scope).
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
 * Warns about third-party packages or missing shrinkwrap, and prompts for user confirmation before installation.
 */
export async function promptSecurityConfirmation(
  options: PromptSecurityConfirmationOptions,
): Promise<boolean> {
  const { rawPkgName, packageName, nonInteractive, force } = options;
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
      force,
    });
    if (!confirmInstallation) {
      throw new FirebaseError("Installation cancelled.");
    }
  }

  return isThirdParty;
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
      pkgJson = ((await fs.readJson(absPackageJsonPath)) as typeof pkgJson | null) || {};
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
export async function writeKitIndexTs(options: WriteKitIndexTsOptions): Promise<void> {
  const { config, sourcePath, packageName, templateType } = options;
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
  await writeKitIndexTs({ config, sourcePath, packageName, templateType });

  return { sourcePath, configDirPath, absSourcePath, absConfigDirPath };
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
      const lockfile = (await fs.readJson(lockfilePath)) as PackageLock | null;
      const packages = lockfile?.packages || {};
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
        const kitPkgJson = (await fs.readJson(kitPkgJsonPath)) as KitManifest | null;
        peerDeps = kitPkgJson?.peerDependencies || {};
        directDeps = kitPkgJson?.dependencies || {};
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

/**
 * Creates a KitSourceAdapter for an NPM package kit.
 */
export function createNpmPackageAdapter(options: NpmPackageAdapterOptions): KitSourceAdapter {
  validateNpmPackageName(options.package);
  const { packageName } = parseNpmPackageSpecifier(options.package);
  const templateType = options.template || DEFAULT_TEMPLATE;
  if (!(templateType in TEMPLATES)) {
    const validTemplates = Object.keys(TEMPLATES)
      .map((t) => `'${t}'`)
      .join(" or ");
    throw new FirebaseError(
      `Invalid template '${templateType}'. Template must be ${validTemplates}.`,
    );
  }

  return {
    defaultKitId: sanitizePackageNameToKitName(packageName) || "kit",
    findExistingKit(existingFunctions: ValidatedSingle[]): ValidatedKitSingle | undefined {
      return existingFunctions.find(
        (c): c is ValidatedKitSingle => isKitConfig(c) && c.sourcePackage?.name === packageName,
      );
    },
    async validateAndConfirm(): Promise<void> {
      await validateNpmPackageExists(options.package);
      await promptSecurityConfirmation({
        rawPkgName: options.package,
        packageName,
        nonInteractive: options.nonInteractive,
        force: options.force,
      });
    },
    async prepareSource(kitId: string, createdPaths: string[]): Promise<PreparedKitSource> {
      const absKitDir = options.config.path(path.join(FUNCTION_KITS_DIR, kitId));
      createdPaths.push(absKitDir);

      const { sourcePath, absSourcePath } = await scaffoldKitFiles(
        options.config,
        kitId,
        kitId,
        packageName,
        templateType,
      );
      await buildAndInstallKit(absSourcePath, options.package, isThirdPartyPackage(packageName));

      return {
        sourcePath,
        sourcePackage: { name: packageName },
        predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
      };
    },
  };
}
