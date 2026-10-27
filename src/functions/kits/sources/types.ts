import { KitSourcePackage } from "../../../firebaseConfig";
import type { ActiveRuntime } from "../../../deploy/functions/runtimes/supported/types";
import { ValidatedKitSingle, ValidatedSingle } from "../../projectConfig";

export const FUNCTION_KITS_DIR = "function-kits";
export const MAX_KIT_ID_LENGTH = 40;

export interface PreparedKitSource {
  sourcePath: string;
  sourcePackage?: KitSourcePackage;
  predeploy?: string[];
  runtime?: ActiveRuntime;
}

/**
 * Sanitizes a raw name into a valid kit identifier (lowercase alphanumeric, underscores, and hyphens, max 40 chars).
 */
export function sanitizeToKitId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, MAX_KIT_ID_LENGTH);
}

export interface KitSourceAdapter {
  /** Default name to suggest when prompting for a kit ID. */
  defaultKitId: string;
  /** Checks if this source is already registered as a kit in firebase.json. */
  findExistingKit(existingFunctions: ValidatedSingle[]): ValidatedKitSingle | undefined;
  /** Validates the source and prompts for any required security/lockfile confirmations. */
  validateAndConfirm(): Promise<void>;
  /** Scaffolds (if needed), installs dependencies, and builds the kit source directory. */
  prepareSource(kitId: string, createdPaths: string[]): Promise<PreparedKitSource>;
}
