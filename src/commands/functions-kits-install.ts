import * as clc from "colorette";
import * as path from "path";
import * as fs from "fs-extra";

import { Command } from "../command";
import { FirebaseError, getErrMsg } from "../error";
import { KitFunctionConfig } from "../firebaseConfig";

import {
  isKitConfig,
  normalizeAndValidate,
  validateKit,
  validateKitInstances,
  ValidatedConfig,
} from "../functions/projectConfig";
import * as experiments from "../experiments";
import { logger } from "../logger";
import { Options } from "../options";
import { confirm, input } from "../prompt";
import { spawnWithOutput, wrapSpawn } from "../init/spawn";
import { readTemplateSync } from "../templates";
import * as supported from "../deploy/functions/runtimes/supported";
import * as self from "./functions-kits-install";

const PACKAGE_NO_LINTING_TEMPLATE = readTemplateSync(
  "init/functions/typescript/package.nolint.json",
);
const TSCONFIG_TEMPLATE = readTemplateSync("init/functions/typescript/tsconfig.json");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/typescript/_gitignore");
const INDEX_KIT_TEMPLATE = readTemplateSync("init/functions/typescript/index-kit.ts");

export interface FunctionsKitsInstallOptions extends Options {
  npm_package?: string;
}

/**
 * Parses a package specifier string into package name and version.
 * e.g., "@firebase-functions-kits/firestore-bigquery-export@1.0.0" ->
 * { packageName: "@firebase-functions-kits/firestore-bigquery-export", version: "1.0.0" }
 */
export function parsePackageSpecifier(rawPkg: string): { packageName: string; version?: string } {
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
 * Sanitizes an npm package name into a valid kit identifier.
 * e.g., "@firebase-functions-kits/firestore-bigquery-export" -> "firestore-bigquery-export"
 */
export function sanitizePackageNameToKitName(packageName: string): string {
  const parts = packageName.split("/");
  const nameWithoutScope = parts[parts.length - 1] || packageName;
  const sanitized = nameWithoutScope
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9_-]/g, "");
  return (sanitized || "kit").slice(0, 40);
}

/**
 * Checks if a package name is third-party (outside the @firebase-functions-kits scope).
 */
export function isThirdPartyPackage(packageName: string): boolean {
  return (
    !packageName.startsWith("@firebase-functions-kits/") &&
    packageName !== "@firebase-functions-kits"
  );
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

export const command = new Command("functions:kits:install")
  .description("install a Cloud Function kit into your project")
  .option("--npm_package <package>", "NPM package name or specifier for the function kit")
  .action(async (options: FunctionsKitsInstallOptions): Promise<void> => {
    experiments.assertEnabled("kits", "install a function kit");

    if (!options.config) {
      throw new FirebaseError("Not in a Firebase project directory (firebase.json not found).");
    }

    const rawPkgName = options.npm_package;
    if (!rawPkgName) {
      throw new FirebaseError("set the --npm_package option to a valid NPM package and try again.");
    }

    const { packageName, version } = parsePackageSpecifier(rawPkgName);
    const kitId = sanitizePackageNameToKitName(packageName);
    validateKit(kitId);

    const isThirdParty = isThirdPartyPackage(packageName);
    if (isThirdParty) {
      logger.warn(
        clc.yellow(
          `Warning: Package ${clc.bold(packageName)} is a third-party kit (outside the @firebase-functions-kits scope).`,
        ),
      );
      const hasShrinkwrap = await self.checkPackageHasShrinkwrap(rawPkgName);
      if (!hasShrinkwrap) {
        logger.warn(
          clc.yellow(
            `Warning: Package ${clc.bold(packageName)} does not have an npm-shrinkwrap.json file. Dependencies are not locked and may present a security risk.`,
          ),
        );
      }
      const confirmInstallation = await confirm({
        message: `Are you sure you want to install the third-party kit ${packageName}?`,
        default: true,
        nonInteractive: options.nonInteractive,
      });
      if (!confirmInstallation) {
        throw new FirebaseError("Installation cancelled.");
      }
    }

    const instanceId = await input({
      message: "What would you like to name your first instance of this kit?",
      default: kitId,
      nonInteractive: options.nonInteractive,
    });

    const sourcePath = path.join("function-kits", kitId, "src");
    const configDirPath = path.join("function-kits", kitId, `config-${instanceId}`);

    let existingFunctions: ValidatedConfig | [] = [];
    const configFunctions = options.config.src.functions;
    if (configFunctions && (!Array.isArray(configFunctions) || configFunctions.length > 0)) {
      try {
        existingFunctions = normalizeAndValidate(configFunctions);
      } catch (err: unknown) {
        throw new FirebaseError(`Invalid existing functions configuration: ${getErrMsg(err)}`);
      }
    }

    for (const c of existingFunctions) {
      if (isKitConfig(c) && c.kit === kitId) {
        throw new FirebaseError(
          `functions.kit must be unique but '${kitId}' was used more than once.`,
        );
      }
    }

    const existingCodebases = new Set<string>();
    const existingInstanceIds = new Set<string>();
    for (const c of existingFunctions) {
      if ("codebase" in c && c.codebase) {
        existingCodebases.add(c.codebase);
      }
      if ("instances" in c && c.instances) {
        validateKitInstances(c.instances, existingInstanceIds);
      }
    }

    validateKitInstances({ [instanceId]: configDirPath }, existingInstanceIds);

    if (existingCodebases.has(instanceId)) {
      throw new FirebaseError(
        `functions codebase name and kit instance ID must be mutually exclusive, but '${instanceId}' was used as both a codebase name and a kit instance ID.`,
      );
    }

    const absSourcePath = options.config.path(sourcePath);
    const absConfigDirPath = options.config.path(configDirPath);

    await fs.ensureDir(absSourcePath);
    await fs.ensureDir(absConfigDirPath);

    const relPackageJsonPath = path.join(sourcePath, "package.json");
    const absPackageJsonPath = options.config.path(relPackageJsonPath);
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

    await options.config.askWriteProjectFile(relPackageJsonPath, pkgJson);
    await options.config.askWriteProjectFile(
      path.join(sourcePath, "tsconfig.json"),
      TSCONFIG_TEMPLATE,
    );
    await options.config.askWriteProjectFile(
      path.join(sourcePath, ".gitignore"),
      GITIGNORE_TEMPLATE,
    );

    const relIndexTsPath = path.join(sourcePath, "index.ts");
    const absIndexTsPath = options.config.path(relIndexTsPath);
    if (!(await fs.pathExists(absIndexTsPath))) {
      const indexContent = INDEX_KIT_TEMPLATE.replace("{{PACKAGE_NAME}}", packageName);
      await options.config.askWriteProjectFile(relIndexTsPath, indexContent);
    }

    const installArgs = isThirdParty ? ["install", "--ignore-scripts"] : ["install"];
    logger.info(clc.bold(`Running npm ${installArgs.join(" ")}...`));
    try {
      await wrapSpawn("npm", installArgs, absSourcePath);
    } catch (err: unknown) {
      throw new FirebaseError(`NPM install failed: ${getErrMsg(err)}`);
    }

    logger.info(clc.bold("Building TypeScript source..."));
    try {
      await wrapSpawn("npm", ["run", "build"], absSourcePath);
    } catch (err: unknown) {
      throw new FirebaseError(`TypeScript build failed: ${getErrMsg(err)}`);
    }

    const newKitConfig: KitFunctionConfig = {
      kit: kitId,
      sourcePackage: {
        id: packageName,
      },
      source: sourcePath,
      instances: {
        [instanceId]: configDirPath,
      },
      predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
    };

    if (!options.config.src.functions) {
      options.config.src.functions = [newKitConfig];
    } else if (Array.isArray(options.config.src.functions)) {
      options.config.src.functions.push(newKitConfig);
    } else {
      options.config.src.functions = [options.config.src.functions, newKitConfig];
    }

    options.config.writeProjectFile("firebase.json", options.config.src);
    logger.info(clc.green(`✔ Function kit ${clc.bold(kitId)} successfully installed.`));
  });
