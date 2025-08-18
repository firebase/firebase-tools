import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { fetchIssueDetails } from "../../../crashlytics/fetchIssueDetails.js";

export const fetch_issue_details = tool(
  {
    name: "fetch_issue_details",
    description: "Provide the details about a specific crashlytics issue.",
    inputSchema: z.object({
      app_id: z
        .string()
        .optional()
        .describe(
          "AppId for which the issues list is fetched. Defaults to the first appId provided by firebase_list_apps.",
        ),
      issue_id: z
        .string()
        .optional()
        .describe(
          "The issue ID for which the details needs to be fetched. This is the value of the field `id` in the list of issues. Defaults to the first id in the list of issues.",
        ),
    }),
    annotations: {
      title: "Fetch details of a specific issue.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ app_id, issue_id }, { projectId }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);
    if (!issue_id) return mcpError(`Must specify 'issue_id' parameter.`);

    return toContent(await fetchIssueDetails(projectId, app_id, issue_id));
  },
);
