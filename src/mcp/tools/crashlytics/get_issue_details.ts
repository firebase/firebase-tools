import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { getIssueDetails } from "../../../crashlytics/getIssueDetails";
import { APP_ID_FIELD } from "./constants";

export const get_issue_details = tool(
  {
    name: "get_issue_details",
    description: "Gets the details about a specific crashlytics issue.",
    inputSchema: z.object({
      app_id: APP_ID_FIELD,
      issue_id: z
        .string()
        .describe(
          "The issue ID for which the details needs to be fetched. This is the value of the field `id` in the list of issues. Defaults to the first id in the list of issues.",
        ),
    }),
    annotations: {
      title: "Gets the details of a specific issue.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ app_id, issue_id }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);
    if (!issue_id) return mcpError(`Must specify 'issue_id' parameter.`);

    return toContent(await getIssueDetails(app_id, issue_id));
  },
);
