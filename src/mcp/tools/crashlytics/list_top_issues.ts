import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { listTopIssues } from "../../../crashlytics/listTopIssues.js";

export const list_top_issues = tool(
  {
    name: "list_top_issues",
    description: "List the top issues happening in the application.",
    inputSchema: z.object({
      /* Platform for which the issues are to be fetched. For eg: ANDROID, IOS. */
      platform: z.string(),
      /* Name of the package for the mobile application. Typically of format com.x.y. */
      package_name: z.string(),
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
  async ({ platform, package_name, issue_count, lookback_period }, { projectId }) => {
    if (platform === undefined) {
      return mcpError(`Must specify 'platform' parameter.`);
    }
    if (package_name === undefined) {
      return mcpError(`Must specify 'package_name' parameter.`);
    }
    if (issue_count === undefined) {
      issue_count = 10;
    }
    if (lookback_period === undefined) {
      lookback_period = 7;
    }
    return toContent(
      await listTopIssues(projectId!, platform, package_name, issue_count, lookback_period),
    );
  },
);
