import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { listTopIssues } from "../../../crashlytics/listTopIssues";
import { APP_ID_FIELD } from "./constants";

export const list_top_issues = tool(
  {
    name: "list_top_issues",
    description: "List the top crashes from crashlytics happening in the application.",
    inputSchema: z.object({
      app_id: APP_ID_FIELD,
      issue_count: z
        .number()
        .optional()
        .describe("Number of issues that needs to be fetched. Defaults to 10 if unspecified.")
        .default(10),
      issue_type: z
        .enum(["FATAL", "NON-FATAL", "ANR"])
        .optional()
        .default("FATAL")
        .describe(
          "Types of issues that can be fetched comma-separated. Defaults to `FATAL` (Crashes). Other values include NON-FATAL (Non-fatal issues), ANR (Application not responding).",
        ),
    }),
    annotations: {
      title: "List Top Crashlytics Issues.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ app_id, issue_type, issue_count }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);

    issue_type ??= "FATAL";
    issue_count ??= 10;

    return toContent(await listTopIssues(app_id, issue_type, issue_count));
  },
);
