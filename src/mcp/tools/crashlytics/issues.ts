import { z } from "zod";
import { tool } from "../../tool";
import { getIssue, updateIssue } from "../../../crashlytics/issues";
import { State } from "../../../crashlytics/types";
import { ApplicationIdSchema, IssueIdSchema } from "../../../crashlytics/filters";
import { mcpError, toContent } from "../../util";

export const get_issue = tool(
  "crashlytics",
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
  },
  async ({ appId, issueId }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    if (!issueId) return mcpError(`Must specify 'issueId' parameter.`);

    return toContent(await getIssue(appId, issueId));
  },
);

export const update_issue = tool(
  "crashlytics",
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
  },
  async ({ appId, issueId, state }) => {
    if (!appId) return mcpError(`Must specify 'app_id' parameter.`);
    if (!issueId) return mcpError(`Must specify 'issue_id' parameter.`);
    if (!state) return mcpError(`Must specify 'state' parameter.`);

    return toContent(await updateIssue(appId, issueId, state));
  },
);
