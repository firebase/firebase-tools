import { z } from "zod";
import { tool } from "../../tool";
import { McpContext } from "../../types";
import { checkFeatureActive, mcpError, toContent } from "../../util";
import { createNote, listNotes, deleteNote } from "../../../crashlytics/notes";
import { ApplicationIdSchema, IssueIdSchema } from "../../../crashlytics/filters";

export const create_note = tool(
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
    isAvailable: async (ctx: McpContext) => {
      return await checkFeatureActive("crashlytics", ctx.projectId, { config: ctx.config });
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
    isAvailable: async (ctx: McpContext) => {
      return await checkFeatureActive("crashlytics", ctx.projectId, { config: ctx.config });
    },
  },
  async ({ appId, issueId, pageSize }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    if (!issueId) return mcpError(`Must specify 'issueId' parameter.`);

    return toContent(await listNotes(appId, issueId, pageSize));
  },
);

export const delete_note = tool(
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
    isAvailable: async (ctx: McpContext) => {
      return await checkFeatureActive("crashlytics", ctx.projectId, { config: ctx.config });
    },
  },
  async ({ appId, issueId, noteId }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    if (!issueId) return mcpError(`Must specify 'issueId' parameter.`);
    if (!noteId) return mcpError(`Must specify 'noteId' parameter.`);

    return toContent(await deleteNote(appId, issueId, noteId));
  },
);
