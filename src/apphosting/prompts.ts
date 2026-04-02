import { select, confirm, Choice } from "../prompt";
import { logWarning } from "../utils";
import * as apphosting from "../gcp/apphosting";
export const DEFAULT_RUNTIME = "nodejs";

/**
 * Asks the user for their runtime. This is required for ABIU.
 */
export async function promptRuntime(projectId: string, location: string): Promise<string> {
  const choices: Choice<string>[] = [{ name: "Node.js (default)", value: DEFAULT_RUNTIME }];
  try {
    const supportedRuntimes = await apphosting.listSupportedRuntimes(projectId, location);
    for (const r of supportedRuntimes) {
      if (r.runtimeId !== DEFAULT_RUNTIME) {
        choices.push({ name: r.runtimeId, value: r.runtimeId });
      }
    }
  } catch (err) {
    logWarning("Failed to list supported runtimes. Falling back to hardcoded list.");
    // We add this hardcoded nodejs22 to unblock testing.
    // This line will be removed when the ListSupportedRuntime API is stable.
    choices.push({ name: "nodejs22", value: "nodejs22" });
  }
  return await select({
    message: "Which runtime do you want to use?",
    choices: choices,
    default: DEFAULT_RUNTIME,
  });
}

/**
 * Asks the user if ABIU should be enabled. True by default.
 */
export async function promptAutomaticBaseImageUpdates(): Promise<boolean> {
  return await confirm({
    message: "Would you like to enable Automatic Base Image Updates (ABIU)?",
    default: true,
  });
}
