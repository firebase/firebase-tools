import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { addNote } from "../../../crashlytics/addNote";

export const add_note = tool(
  {
    name: "add_note",
    description: "Add a note to an issue from crashlytics.",
    inputSchema: z.object({
      app_id: z
        .string()
        .optional()
        .describe(
          "AppId for which the issues list should be fetched. For an Android application, read the mobilesdk_app_id value specified in the google-services.json file for the current package name. For an iOS Application, read the GOOGLE_APP_ID from GoogleService-Info.plist. If neither is available, use the `firebase_list_apps` tool to find an app_id to pass to this tool.",
        ),
      issue_id: z.string().optional().describe("The issue id to add the note to."),
      note: z.string().optional().describe("The note to add to the issue."),
    }),
    annotations: {
      title: "Add note to Crashlytics issue.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ app_id, issue_id, note }, { projectId }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);
    if (!issue_id) return mcpError(`Must specify 'issue_id' parameter.`);
    if (!note) return mcpError(`Must specify 'note' parameter.`);

    return toContent(await addNote(projectId, app_id, issue_id, note));
  },
);
