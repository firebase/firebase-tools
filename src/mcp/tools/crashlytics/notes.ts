import { z } from "zod";
import { tool } from "../../tool";
import { createNote, listNotes, deleteNote } from "../../../crashlytics/notes";
import { ApplicationIdSchema, IssueIdSchema } from "../../../crashlytics/filters";
import { mcpError, toContent } from "../../util";

export const create_note = tool(
  "crashlytics",
  {
    name: "create_note",
    description: "Add a note to an issue from crashlytics.",
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      issueId: IssueIdSchema,
      note: z.string().describe("The note to add to the issue."),
    }),
    annotations: {
      title: "Add note to Crashlytics issue.",
      readOnlyHint: false,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ appId, issueId, note }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    if (!issueId) return mcpError(`Must specify 'issueId' parameter.`);
    if (!note) return mcpError(`Must specify 'note' parameter.`);

    return toContent(await createNote(appId, issueId, note));
  },
);

export const list_notes = tool(
  "crashlytics",
  {
    name: "list_notes",
    description: "Use this to list all notes for an issue in Crashlytics.",
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      issueId: IssueIdSchema,
      pageSize: z.number().optional().default(20).describe("Number of rows to return"),
    }),
    annotations: {
      title: "List notes for a Crashlytics issue.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ appId, issueId, pageSize }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    if (!issueId) return mcpError(`Must specify 'issueId' parameter.`);

    return toContent(await listNotes(appId, issueId, pageSize));
  },
);

export const delete_note = tool(
  "crashlytics",
  {
    name: "delete_note",
    description: "Delete a note from a Crashlytics issue.",
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      issueId: IssueIdSchema,
      noteId: z.string().describe("The id of the note to delete"),
    }),
    annotations: {
      title: "Delete Crashlytics Issue Note",
      readOnlyHint: false,
      destructiveHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ appId, issueId, noteId }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    if (!issueId) return mcpError(`Must specify 'issueId' parameter.`);
    if (!noteId) return mcpError(`Must specify 'noteId' parameter.`);

    return toContent(await deleteNote(appId, issueId, noteId));
  },
);
