import { sync } from "glob";
import { existsSync } from "fs-extra";
import * as path from "node:path";
import { readTypedJson, readTypedYaml } from "./utils";
import { logger } from "../../../logger";

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
export function findWorkspacePackages(workspaceRoot: string): WorkspacePackageRegistry {
  const registry: WorkspacePackageRegistry = {};

  const globs = getGlobs(workspaceRoot);

  const currentCwd = process.cwd();
  process.chdir(workspaceRoot);

  const allPackages = globs.flatMap((glob) => sync(glob));

  for (const relativePackageDir of allPackages) {
    const packageJsonPath = path.join(workspaceRoot, relativePackageDir, "package.json");

    if (!existsSync(packageJsonPath)) {
      continue;
    }

    logger.debug(`Registering package ${relativePackageDir}`);

    const manifest = readTypedJson<PackageJson>(packageJsonPath);

    registry[manifest.name] = {
      relativePackageDir: relativePackageDir,
      absoluteDir: path.join(workspaceRoot, relativePackageDir),
      manifest: manifest,
    };
  }
  process.chdir(currentCwd);
  return registry;
}

function getGlobs(workspaceRoot: string): string[] {
  const pnpmWorkspaceFile = path.join(
    workspaceRoot,
    process.env.PNPM_WORKSPACE_FILE || "pnpm-workspace.yaml"
  );
  if (existsSync(pnpmWorkspaceFile)) {
    logger.debug("Reading pnpm workspace file:", pnpmWorkspaceFile);
    const data = readTypedYaml<{ packages?: string[] }>(pnpmWorkspaceFile);
    return data.packages || [];
  }

  const packageJsonFile = path.join(workspaceRoot, "package.json");
  logger.debug("Reading workspace package.json:", packageJsonFile);
  const packageJson = readTypedJson<PackageJson>(packageJsonFile);
  return packageJson.workspaces || [];
}
