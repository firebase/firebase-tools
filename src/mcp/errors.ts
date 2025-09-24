import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { mcpError } from "./util";
import { configstore } from "../configstore";
import { check, ensure } from "../ensureApiEnabled";
import { cloudAiCompanionOrigin } from "../api";

export const NO_PROJECT_ERROR = mcpError(
  "To proceed requires an active project. Use the `firebase_update_environment` tool to set a project ID",
  "PRECONDITION_FAILED",
);

const GEMINI_TOS_ERROR = mcpError(
  "To proceed requires features from Gemini in Firebase. You can enable the usage of this service and accept its associated terms of service using `firebase_update_environment`.\n" +
    "Learn more about Gemini in Firebase and how it uses your data: https://firebase.google.com/docs/gemini-in-firebase#how-gemini-in-firebase-uses-your-data",
  "PRECONDITION_FAILED",
);

/** Enable the Gemini in Firebase API or return an error to accept it */
export async function requireGeminiToS(projectId: string): Promise<CallToolResult | undefined> {
  if (!projectId) {
    return NO_PROJECT_ERROR;
  }
  if (configstore.get("gemini")) {
    await ensure(projectId, cloudAiCompanionOrigin(), "");
  } else {
    if (!(await check(projectId, cloudAiCompanionOrigin(), ""))) {
      return GEMINI_TOS_ERROR;
    }
  }
  return undefined;
}

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
