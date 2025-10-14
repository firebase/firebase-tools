import { z } from "zod";
import { tool } from "../../tool";
import { McpContext } from "../../types";
import { checkFeatureActive, mcpError, toContent } from "../../util";
import { getIssue, updateIssue } from "../../../crashlytics/issues";
import { State } from "../../../crashlytics/types";
import { ApplicationIdSchema, IssueIdSchema } from "../../../crashlytics/filters";

export const get_issue = tool(
  {
    name: "get_issue",
    description: `Gets data for a Crashlytics issue, which can be used as a starting point for debugging.`,
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      issueId: IssueIdSchema,
    }),
    annotations: {
      title: "Get Crashlytics Issue Details",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
    isAvailable: async (ctx: McpContext) => {
      return await checkFeatureActive("crashlytics", ctx.projectId, { config: ctx.config });
    },
  },
  async ({ appId, issueId }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    if (!issueId) return mcpError(`Must specify 'issueId' parameter.`);

    return toContent(await getIssue(appId, issueId));
  },
);

export const update_issue = tool(
  {
    name: "update_issue",
    description: "Use this to update the state of Crashlytics issue.",
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      issueId: IssueIdSchema,
      state: z
        .nativeEnum(State)
        .describe("The new state for the issue. Can be 'OPEN' or 'CLOSED'."),
    }),
    annotations: {
      title: "Update Crashlytics Issue",
      readOnlyHint: false,
    },
    _meta: {
      requiresAuth: true,
    },
    isAvailable: async (ctx: McpContext) => {
      return await checkFeatureActive("crashlytics", ctx.projectId, { config: ctx.config });
    },
  },
  async ({ appId, issueId, state }) => {
    if (!appId) return mcpError(`Must specify 'app_id' parameter.`);
    if (!issueId) return mcpError(`Must specify 'issue_id' parameter.`);
    if (!state) return mcpError(`Must specify 'state' parameter.`);

    return toContent(await updateIssue(appId, issueId, state));
  },
);
