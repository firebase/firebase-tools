import { env } from "process";

/**
 * Detect if code is running in a VSCode Extension
 */
export function isVSCodeExtension(): boolean {
  return !!env.VSCODE_CWD;
}
