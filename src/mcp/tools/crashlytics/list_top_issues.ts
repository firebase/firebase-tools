import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { listTopIssues } from "../../../crashlytics/listTopIssues.js";

export const list_top_issues = tool(
  {
    name: "list_top_issues",
    description: "List the top issues happening in the application.",
    inputSchema: z.object({
      app_id: z.string().describe("appId for which the issues list is fetched."),
      issue_count: z
        .number()
        .optional()
        .describe("Number of issues that needs to be fetched. Defaults to 10 if unspecified."),
      lookback_days: z
        .number()
        .optional()
        .describe("Number of days looked back to fetch top issues. Defaults to 7 if unspecified."),
    }),
    annotations: {
      title: "List Top Crashlytics Issues.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ app_id, issue_count, lookback_days }, { projectId }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);

    issue_count ??= 10;
    lookback_days ??= 7;

    return toContent(await listTopIssues(projectId!, app_id, issue_count, lookback_days));
  },
);
