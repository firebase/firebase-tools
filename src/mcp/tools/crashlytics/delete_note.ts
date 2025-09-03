import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { deleteNote } from "../../../crashlytics/deleteNote";
import { APP_ID_FIELD } from "./constants";

export const delete_note = tool(
  {
    name: "delete_note",
    description: "Delete a note from an issue in Crashlytics.",
    inputSchema: z.object({
      app_id: APP_ID_FIELD,
      issue_id: z.string().describe("The issue id to delete the note from."),
      note_id: z.string().describe("The note id to delete."),
    }),
    annotations: {
      title: "Delete Note from Crashlytics Issue.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ app_id, issue_id, note_id }) => {
    if (!app_id) {
      return mcpError(`Must specify 'app_id' parameter.`);
    }
    if (!issue_id) {
      return mcpError(`Must specify 'issue_id' parameter.`);
    }
    if (!note_id) {
      return mcpError(`Must specify 'note_id' parameter.`);
    }

    return toContent(await deleteNote(app_id, issue_id, note_id));
  },
);
