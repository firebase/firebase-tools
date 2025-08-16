import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { deleteNote } from "../../../crashlytics/deleteNote";

export const delete_note = tool(
  {
    name: "delete_note",
    description: "Delete a note from an issue in Crashlytics.",
    inputSchema: z.object({
      app_id: z
        .string()
        .optional()
        .describe(
          "AppId for the application to delete the note from. For an Android application, read the mobilesdk_app_id value specified in the google-services.json file for the current package name. For an iOS Application, read the GOOGLE_APP_ID from GoogleService-Info.plist. If neither is available, use the `firebase_list_apps` tool to find an app_id to pass to this tool.",
        ),
      issue_id: z.string().optional().describe("The issue id to delete the note from."),
      note_id: z.string().optional().describe("The note id to delete."),
    }),
    annotations: {
      title: "Delete Note from Crashlytics Issue.",
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ app_id, issue_id, note_id }, { projectId }) => {
    if (!app_id) {
      return mcpError(`Must specify 'app_id' parameter.`);
    }
    if (!issue_id) {
      return mcpError(`Must specify 'issue_id' parameter.`);
    }
    if (!note_id) {
      return mcpError(`Must specify 'note_id' parameter.`);
    }

    await deleteNote(projectId, app_id, issue_id, note_id);
    return toContent(`Successfully deleted note ${note_id} from issue ${issue_id}.`);
  },
);
