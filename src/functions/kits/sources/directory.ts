import * as path from "path";
import * as fs from "fs-extra";

import { Config } from "../../../config";
import { FirebaseError, getErrMsg } from "../../../error";
import { wrapSpawn } from "../../../init/spawn";
import { logLabeledBullet, resolveWithin } from "../../../utils";
import { isKitConfig, ValidatedKitSingle, ValidatedSingle } from "../../projectConfig";
import { KitSourceAdapter, PreparedKitSource, sanitizeToKitId } from "./types";

export interface ValidatedDirectoryKit {
  absDirectoryPath: string;
  relSourcePath: string;
  hasBuildScript: boolean;
}

export interface DirectoryAdapterOptions {
  config: Config;
  directory: string;
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
    packageJson = ((await fs.readJson(packageJsonPath)) as typeof packageJson | null) || {};
  } catch (err: unknown) {
    throw new FirebaseError(`Failed to parse package.json in '${rawDir}': ${getErrMsg(err)}`);
  }

  const hasBuildScript = Boolean(packageJson?.scripts?.build);

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
 * Creates a KitSourceAdapter for a local directory kit.
 */
export function createDirectoryAdapter(options: DirectoryAdapterOptions): KitSourceAdapter {
  const absDir = path.isAbsolute(options.directory)
    ? options.directory
    : path.resolve(options.config.projectDir, options.directory);
  let validated: ValidatedDirectoryKit | undefined;

  return {
    defaultKitId: sanitizeToKitId(path.basename(absDir)) || "kit",
    findExistingKit(existingFunctions: ValidatedSingle[]): ValidatedKitSingle | undefined {
      return existingFunctions.find(
        (c): c is ValidatedKitSingle =>
          isKitConfig(c) &&
          !c.sourcePackage &&
          path.resolve(options.config.projectDir, c.source) === absDir,
      );
    },
    async validateAndConfirm(): Promise<void> {
      validated = await validateAndResolveDirectoryKit(
        options.config.projectDir,
        options.directory,
      );
    },
    async prepareSource(): Promise<PreparedKitSource> {
      if (!validated) {
        validated = await validateAndResolveDirectoryKit(
          options.config.projectDir,
          options.directory,
        );
      }
      await buildAndInstallDirectoryKit(validated.absDirectoryPath, validated.hasBuildScript);
      return {
        sourcePath: validated.relSourcePath,
        ...(validated.hasBuildScript
          ? { predeploy: ['npm --prefix "$RESOURCE_DIR" run build'] }
          : {}),
      };
    },
  };
}
