import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { listNotes } from "../../../crashlytics/listNotes";
import { APP_ID_FIELD } from "./constants";

export const list_notes = tool(
  {
    name: "list_notes",
    description: "List all notes for an issue in Crashlytics.",
    inputSchema: z.object({
      app_id: APP_ID_FIELD,
      issue_id: z.string().describe("The issue id to list notes for."),
      note_count: z
        .number()
        .optional()
        .default(10)
        .describe("Number of notes that needs to be fetched. Defaults to 10 if unspecified."),
    }),
    annotations: {
      title: "List notes for a Crashlytics issue.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ app_id, issue_id, note_count }) => {
    if (!app_id) {
      return mcpError(`Must specify 'app_id' parameter.`);
    }
    if (!issue_id) {
      return mcpError(`Must specify 'issue_id' parameter.`);
    }

    note_count ??= 10;

    return toContent(await listNotes(app_id, issue_id, note_count));
  },
);
