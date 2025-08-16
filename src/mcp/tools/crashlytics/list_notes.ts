import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { listNotes } from "../../../crashlytics/listNotes";

export const list_notes = tool(
  {
    name: "list_notes",
    description: "List all notes for an issue in Crashlytics.",
    inputSchema: z.object({
      app_id: z
        .string()
        .optional()
        .describe(
          "AppId for the application to list notes from. For an Android application, read the mobilesdk_app_id value specified in the google-services.json file for the current package name. For an iOS Application, read the GOOGLE_APP_ID from GoogleService-Info.plist. If neither is available, use the `firebase_list_apps` tool to find an app_id to pass to this tool.",
        ),
      issue_id: z.string().optional().describe("The issue id to list notes for."),
    }),
    annotations: {
      title: "List Notes for a Crashlytics Issue.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ app_id, issue_id }, { projectId }) => {
    if (!app_id) {
      return mcpError(`Must specify 'app_id' parameter.`);
    }
    if (!issue_id) {
      return mcpError(`Must specify 'issue_id' parameter.`);
    }

    return toContent(await listNotes(projectId, app_id, issue_id));
  },
);
