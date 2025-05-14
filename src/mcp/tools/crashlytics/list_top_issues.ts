import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { listTopIssues } from "../../../crashlytics/listTopIssues.js";

export const list_top_issues = tool(
  {
    name: "list_top_issues",
    description: "List the top issues happening in the application.",
    inputSchema: z.object({
      /* AppId for which the issues list is fetched. */
      app_id: z.string(),
      /* Number of issues that needs to be fetched. */
      issue_count: z.number().optional(),
      /* Number of days to look back to fetch issues. Defaults to 7 days. */
      lookback_period: z.number().optional(),
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
  async ({ app_id, issue_count, lookback_period }, { projectId }) => {
    if (app_id === undefined) {
      return mcpError(`Must specify 'app_id' parameter.`);
    }
    if (issue_count === undefined) {
      issue_count = 10;
    }
    if (lookback_period === undefined) {
      lookback_period = 7;
    }
    return toContent(
      await listTopIssues(projectId!, app_id, issue_count, lookback_period),
    );
  },
);
