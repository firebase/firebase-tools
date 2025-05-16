import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { execSync } from "child_process";
import { dump } from "js-yaml";
import { platform } from "os";
import { ServerFeature } from "./types";
import {
  authManagementOrigin,
  dataconnectOrigin,
  firestoreOrigin,
  messagingApiOrigin,
  remoteConfigApiOrigin,
  storageOrigin,
  crashlyticsApiOrigin,
} from "../api";
import { check } from "../ensureApiEnabled";

/**
 * Converts data to a CallToolResult.
 */
export function toContent(
  data: any,
  options?: { format?: "json" | "yaml"; contentPrefix?: string; contentSuffix?: string },
): CallToolResult {
  if (typeof data === "string") return { content: [{ type: "text", text: data }] };

  let text = "";
  const format = options?.format || "yaml"; // use YAML because it's a little more prose-like for the LLM to parse
  switch (format) {
    case "json":
      text = JSON.stringify(data);
      break;
    case "yaml":
      text = dump(data);
      break;
  }
  const prefix = options?.contentPrefix || "";
  const suffix = options?.contentSuffix || "";
  return {
    content: [{ type: "text", text: `${prefix}${text}${suffix}` }],
  };
}

/**
 * Returns an error message to the user.
 */
export function mcpError(message: Error | string | unknown, code?: string): CallToolResult {
  let errorMessage = "unknown error";
  if (message instanceof Error) {
    errorMessage = message.message;
  }
  if (typeof message === "string") {
    errorMessage = message;
  }
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${code ? `${code}: ` : ""}${errorMessage}` }],
  };
}

/**
 * Checks if a command exists in the system.
 */
export function commandExistsSync(command: string): boolean {
  try {
    const isWindows = platform() === "win32";
    // For Windows, `where` is more appropriate. It also often outputs the path.
    // For Unix-like systems, `which` is standard.
    // The `2> nul` (Windows) or `2>/dev/null` (Unix) redirects stderr to suppress error messages.
    // The `>` nul / `>/dev/null` redirects stdout as we only care about the exit code.
    const commandToCheck = isWindows
      ? `where "${command}" > nul 2> nul`
      : `which "${command}" > /dev/null 2> /dev/null`;

    execSync(commandToCheck);
    return true; // If execSync doesn't throw, the command was found (exit code 0)
  } catch (error) {
    // If the command is not found, execSync will throw an error (non-zero exit code)
    return false;
  }
}

const SERVER_FEATURE_APIS: Record<ServerFeature, string> = {
  firestore: firestoreOrigin(),
  storage: storageOrigin(),
  dataconnect: dataconnectOrigin(),
  auth: authManagementOrigin(),
  messaging: messagingApiOrigin(),
  remoteconfig: remoteConfigApiOrigin(),
  crashlytics: crashlyticsApiOrigin(),
};

/**
 * Detects whether an MCP feature is active in the current project root. Relies first on
 * `firebase.json` configuration, but falls back to API checks.
 */
export async function checkFeatureActive(
  feature: ServerFeature,
  projectId?: string,
  options?: any,
): Promise<boolean> {
  // if the feature is configured in firebase.json, it's active
  if (feature in (options?.config?.data || {})) return true;
  // if the feature's api is active in the project, it's active
  try {
    if (projectId) return await check(projectId, SERVER_FEATURE_APIS[feature], "", true);
  } catch (e) {
    // if we don't have network or something, better to default to on
    return true;
  }
  return false;
}
