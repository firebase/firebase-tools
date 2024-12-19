import fs from "fs-extra";
import { join } from "path";
import { EmulatorLogger } from "../emulatorLogger.js";
import { Emulators } from "../types.js";
import { FirebaseError } from "../../error.js";

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
export async function detectPackageManager(rootdir: string): Promise<PackageManager> {
  if (await fs.pathExists(join(rootdir, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (await fs.pathExists(join(rootdir, "yarn.lock"))) {
    return "yarn";
  }

  if (await fs.pathExists(join(rootdir, "package-lock.json"))) {
    return "npm";
  }

  throw new FirebaseError("Unsupported package manager");
}

export async function detectStartCommand(rootDir: string) {
  try {
    const packageManager = await detectPackageManager(rootDir);
    return `${packageManager} run dev`;
  } catch (e) {
    throw new FirebaseError(
      "Failed to auto-detect your project's start command. Consider manually setting the start command by setting `firebase.json#emulators.apphosting.startCommand`",
    );
  }
}
