import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { updateIssue, IssueState } from "../../../crashlytics/updateIssue";

export const update_issue = tool(
  {
    name: "update_issue",
    description: "Update the state of an issue in Crashlytics.",
    inputSchema: z.object({
      app_id: z
        .string()
        .optional()
        .describe(
          "AppId for which the issue should be updated. For an Android application, read the mobilesdk_app_id value specified in the google-services.json file for the current package name. For an iOS Application, read the GOOGLE_APP_ID from GoogleService-Info.plist. If neither is available, use the `firebase_list_apps` tool to find an app_id to pass to this tool.",
        ),
      issue_id: z.string().optional().describe("The issue id to update."),
      state: z
        .nativeEnum(IssueState)
        .optional()
        .describe("The new state for the issue. Can be 'OPEN' or 'CLOSED'."),
    }),
    annotations: {
      title: "Update Crashlytics issue state.",
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ app_id, issue_id, state }, { projectId }) => {
    if (!app_id) {
      return mcpError(`Must specify 'app_id' parameter.`);
    }
    if (!issue_id) {
      return mcpError(`Must specify 'issue_id' parameter.`);
    }
    if (!state) {
      return mcpError(`Must specify 'state' parameter.`);
    }

    return toContent(await updateIssue(projectId, app_id, issue_id, state));
  },
);
