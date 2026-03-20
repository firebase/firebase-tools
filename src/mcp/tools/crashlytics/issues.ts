import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";
import { ApplicationIdSchema, IssueIdSchema } from "../../../crashlytics/filters";
import { getIssue, updateIssue } from "../../../crashlytics/issues";
import { State } from "../../../crashlytics/types";
import { tool } from "../../tool";
import { toContent } from "../../util";

import { RESOURCE_CONTENT as forceAppIdGuide } from "../../resources/guides/app_id";

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
    const result: CallToolResult = { content: [] };
    if (!appId) {
      result.isError = true;
      result.content.push({ type: "text", text: "Must specify 'appId' parameter" });
      result.content.push({ type: "text", text: forceAppIdGuide });
    }
    if (!issueId) {
      result.isError = true;
      result.content.push({ type: "text", text: "Must specify 'issueId' parameter." });
    }
    if (result.content.length > 0) {
      // There are errors or guides the agent must read
      return result;
    }
    // Continue and get the issue data
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
    const result: CallToolResult = { content: [] };
    if (!appId) {
      result.isError = true;
      result.content.push({ type: "text", text: "Must specify 'appId' parameter" });
      result.content.push({ type: "text", text: forceAppIdGuide });
    }
    if (!issueId) {
      result.isError = true;
      result.content.push({ type: "text", text: "Must specify 'issueId' parameter." });
    }
    if (!state) {
      result.isError = true;
      result.content.push({ type: "text", text: "Must specify 'state' parameter" });
    }
    if (result.content.length > 0) {
      // There are errors or guides the agent must read
      return result;
    }
    // Continue and get the issue data
    return toContent(await updateIssue(appId, issueId, state));
  },
);
