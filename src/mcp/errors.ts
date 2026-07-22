import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { mcpError } from "./util";
export const NO_PROJECT_ERROR = mcpError(
  "To proceed requires an active project. Use the `firebase_update_environment` tool to set a project ID",
  "PRECONDITION_FAILED",
);

export function noProjectDirectory(projectRoot: string | undefined): CallToolResult {
  return mcpError(
    `The current project directory '${
      projectRoot || "<NO PROJECT DIRECTORY FOUND>"
    }' does not exist. Please use the 'update_firebase_environment' tool to target a different project directory.`,
  );
}

export function mcpAuthError(skipADC: boolean): CallToolResult {
  if (skipADC) {
    return mcpError(
      `The user is not currently logged into the Firebase CLI, which is required to use this tool. Please run the 'firebase_login' tool to log in.`,
    );
  }
  return mcpError(`The user is not currently logged into the Firebase CLI, which is required to use this tool. Please run the 'firebase_login' tool to log in, or instruct the user to configure [Application Default Credentials][ADC] on their machine.
[ADC]: https://cloud.google.com/docs/authentication/application-default-credentials`);
}
