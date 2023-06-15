import { sync } from "glob";
import { existsSync } from "fs-extra";
import * as path from "path";
import { readTypedJson, readTypedYaml } from "./utils";
import { logger } from "../../../logger";
import * as utils from "../../../utils";
import * as clc from "colorette";

export interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  workspaces?: string[];
}

export interface WorkspacePackageInfo {
  absoluteDir: string;
  /**
   * The path of the package relative to the workspace root. This is the path
   * referenced in the lock file.
   */
  relativePackageDir: string;
  /**
   * The package.json file contents
   */
  manifest: PackageJson;
}

export type WorkspacePackageRegistry = Record<string, WorkspacePackageInfo>;

/**
 *
 */
export function findWorkspacePackages(workspaceRoot: string): WorkspacePackageRegistry | null {
  const registry: WorkspacePackageRegistry = {};

  const globs = getGlobs(workspaceRoot);
  if (!globs) {
    return null;
  }

  const currentCwd = process.cwd();
  process.chdir(path.join(workspaceRoot, globs.baseDir));
  const allPackages = globs.globs.flatMap((glob) => sync(glob));
  process.chdir(currentCwd);

  logger.debug("Matching packages", allPackages);
  for (const relativePackageDir of allPackages) {
    const dirFromWorkspaceRoot = path.join(globs.baseDir, relativePackageDir);
    const packageJsonPath = path.join(workspaceRoot, dirFromWorkspaceRoot, "package.json");
    if (!existsSync(packageJsonPath)) {
      logger.warn("No package.json found in", dirFromWorkspaceRoot);
      continue;
    }

    const manifest = readTypedJson<PackageJson>(packageJsonPath);
    utils.logBullet(
      clc.cyan(clc.bold("functions:")) +
        " Including workspace package " +
        clc.bold(manifest.name) +
        " (" +
        dirFromWorkspaceRoot +
        ")"
    );

    registry[manifest.name] = {
      relativePackageDir: dirFromWorkspaceRoot,
      absoluteDir: path.join(workspaceRoot, dirFromWorkspaceRoot),
      manifest: manifest,
    };
  }
  return registry;
}

function getGlobs(workspaceRoot: string): { baseDir: string; globs: string[] } | null {
  const pnpmWorkspaceFile = path.join(
    workspaceRoot,
    process.env.PNPM_WORKSPACE_FILE || "pnpm-workspace.yaml"
  );
  if (existsSync(pnpmWorkspaceFile)) {
    logger.debug("Reading pnpm workspace file:", pnpmWorkspaceFile);
    const data = readTypedYaml<{ packages?: string[] }>(pnpmWorkspaceFile);
    return {
      // Globs are relative to the pnpm-workspace.yaml file. Will be "." when the file lies in the root directory
      baseDir: path.dirname(path.relative(workspaceRoot, pnpmWorkspaceFile)),
      globs: data.packages || [],
    };
  }

  logger.debug("Reading workspace package.json");
  if (existsSync("package.json")) {
    const packageJson = readTypedJson<PackageJson>("package.json");
    return {
      baseDir: ".",
      globs: packageJson.workspaces || [],
    };
  }
  return null;
}
