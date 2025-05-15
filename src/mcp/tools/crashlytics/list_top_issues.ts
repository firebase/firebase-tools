import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { listTopIssues } from "../../../crashlytics/listTopIssues.js";

export const list_top_issues = tool(
  {
    name: "list_top_issues",
    description: "List the top crashes from crashlytics happening in the application.",
    inputSchema: z.object({
      app_id: z
        .string()
        .optional()
        .describe(
          "AppId for which the issues list is fetched. Defaults to the first appId provided by firebase_list_apps.",
        ),
      issue_count: z
        .number()
        .optional()
        .describe("Number of issues that needs to be fetched. Defaults to 10 if unspecified."),
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
  async ({ app_id, issue_count }, { projectId }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);

    issue_count ??= 10;

    return toContent(await listTopIssues(projectId!, app_id, issue_count));
  },
);
