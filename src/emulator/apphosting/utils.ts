import { pathExists } from "fs-extra";
import { join } from "path";
import { EmulatorLogger } from "../emulatorLogger";
import { Emulators } from "../types";
import { FirebaseError } from "../../error";

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
async function detectPackageManager(rootdir: string): Promise<PackageManager> {
  if (await pathExists(join(rootdir, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (await pathExists(join(rootdir, "yarn.lock"))) {
    return "yarn";
  }

  if (await pathExists(join(rootdir, "package-lock.json"))) {
    return "npm";
  }

  throw new FirebaseError("Unsupported package manager");
}

export async function detectStartCommand(rootDir: string) {
  let packageManager: PackageManager = "npm";
  try {
    packageManager = await detectPackageManager(rootDir);
  } catch (e) {
    throw new FirebaseError(
      "Failed to detect your project's package manager, consider manually setting the start command with the `startCommandOverride` config. ",
    );
  }

  return `${packageManager} run dev`;
}
