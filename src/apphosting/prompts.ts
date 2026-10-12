import { select, Choice } from "../prompt";
import { logWarning, logBullet } from "../utils";
import * as apphosting from "../gcp/apphosting";
import { isEnabled } from "../experiments";

export const DEFAULT_RUNTIME = "nodejs";

/**
 * Asks the user for their runtime.
 */
export async function promptRuntime(projectId: string, location: string): Promise<string> {
  const choices: Choice<string>[] = [];
  let nodejsChoice: Choice<string> = { name: "Node.js (default)", value: DEFAULT_RUNTIME };

  try {
    const supportedRuntimes = await apphosting.listSupportedRuntimes(projectId, location);
    for (const r of supportedRuntimes) {
      const abiuText = r.automaticBaseImageUpdatesSupported
        ? "Enables Automatic Base Image Updates"
        : "No Automatic Base Image Updates";
      const choiceName = `${r.runtimeId} - ${abiuText}`;

      if (r.runtimeId === DEFAULT_RUNTIME) {
        nodejsChoice = { name: choiceName, value: r.runtimeId };
      } else {
        choices.push({ name: choiceName, value: r.runtimeId });
      }
    }
    choices.unshift(nodejsChoice);
  } catch (err) {
    logWarning("Failed to list supported runtimes. Falling back to hardcoded list.");
    choices.push({ name: "nodejs - No Automatic Base Image Updates", value: "nodejs" });
    choices.push({ name: "nodejs22 - Enables Automatic Base Image Updates", value: "nodejs22" });
  }

  const selectedRuntime = await select({
    message: "Which runtime do you want to use?",
    choices: choices,
    default: DEFAULT_RUNTIME,
  });

  if (selectedRuntime === DEFAULT_RUNTIME) {
    logBullet("ABIU will not be enabled for the unversioned 'nodejs' runtime.");
  }

  return selectedRuntime;
}

/**
 * Resolves the runtime for the backend.
 * Checks if the 'abiu' experiment is enabled and prompts the user if interactive.
 * @param runtimeOption The runtime specified in command arguments (--runtime) if any
 */
export async function resolveRuntime(
  projectId: string,
  location: string,
  nonInteractive: boolean,
  runtimeOption?: string,
): Promise<string | undefined> {
  if (runtimeOption !== undefined) {
    return runtimeOption;
  }
  if (!isEnabled("abiu")) {
    return undefined;
  }
  if (nonInteractive) {
    return DEFAULT_RUNTIME;
  }
  return promptRuntime(projectId, location);
}
