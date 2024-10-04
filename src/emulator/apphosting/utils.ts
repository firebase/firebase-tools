import { pathExists } from "fs-extra";
import { join } from "path";
import { EmulatorLogger } from "../emulatorLogger";
import { Emulators } from "../types";

export const logger = EmulatorLogger.forEmulator(Emulators.APPHOSTING);

/**
 * Supported package managers. This mirrors production.
 */
export type PackageManager = "npm" | "yarn" | "pnpm";

/**
 * Returns the package manager used by the project
 * @param rootdir project's root directory
 * @returns PackageManager
 */
export async function discoverPackageManager(rootdir: string): Promise<PackageManager> {
  if (await pathExists(join(rootdir, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (await pathExists(join(rootdir, "yarn.lock"))) {
    return "yarn";
  }

  return "npm";
}
