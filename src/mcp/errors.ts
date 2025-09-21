import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { mcpError } from "./util";

export const NO_PROJECT_ERROR = mcpError(
  'No active project was found. Use the `firebase_update_environment` tool to set the project directory to an absolute folder location containing a firebase.json config file. Alternatively, change the MCP server config to add [...,"--dir","/absolute/path/to/project/directory"] in its command-line arguments.',
  "PRECONDITION_FAILED",
);

export function mcpAuthError(skipADC: boolean): CallToolResult {
  if (skipADC) {
    return mcpError(
      `The user is not currently logged into the Firebase CLI, which is required to use this tool. Please run the 'firebase_login' tool to log in.`,
    );
  }
  return mcpError(`The user is not currently logged into the Firebase CLI, which is required to use this tool. Please run the 'firebase_login' tool to log in, or instruct the user to configure [Application Default Credentials][ADC] on their machine.
[ADC]: https://cloud.google.com/docs/authentication/application-default-credentials`);
}

export function mcpGeminiError(projectId: string) {
  const consoleUrl = `https://firebase.corp.google.com/project/${projectId}/overview`;
  return mcpError(
    `This tool uses the Gemini in Firebase API. Visit Firebase Console to enable the Gemini in Firebase API ${consoleUrl} and try again.`,
    "PRECONDITION_FAILED",
  );
}
