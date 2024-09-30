import { pathExists } from "fs-extra";
import { join } from "path";

/**
 * Exported for unit testing
 */
export enum PackageManager {
  npm = "npm",
  yarn = "yarn",
  pnpm = "pnpm",
}

/**
 * Returns the package manager used by the project
 * @param rootdir project's root directory
 * @returns PackageManager
 */
export async function discoverPackageManager(rootdir: string): Promise<PackageManager> {
  if (await pathExists(join(rootdir, "pnpm-lock.yaml"))) {
    return PackageManager.pnpm;
  }

  if (await pathExists(join(rootdir, "yarn.lock"))) {
    return PackageManager.yarn;
  }

  return PackageManager.npm;
}
