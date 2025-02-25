import { env } from "process";

/**
 * Detect if code is running in a VSCode Extension
 */
export function isVSCodeExtension(): boolean {
  return !!env.IS_FIREBASE_VSCE;
}
