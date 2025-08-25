import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { addNote } from "../../../crashlytics/addNote";
import { APP_ID_FIELD } from "./constants";

export const add_note = tool(
  {
    name: "add_note",
    description: "Add a note to an issue from crashlytics.",
    inputSchema: z.object({
      app_id: APP_ID_FIELD,
      issue_id: z.string().describe("The issue id to add the note to."),
      note: z.string().describe("The note to add to the issue."),
    }),
    annotations: {
      title: "Add note to Crashlytics issue.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ app_id, issue_id, note }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);
    if (!issue_id) return mcpError(`Must specify 'issue_id' parameter.`);
    if (!note) return mcpError(`Must specify 'note' parameter.`);

    return toContent(await addNote(app_id, issue_id, note));
  },
);
