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
          "AppId for which the issues list should be fetched. For an Android application, defaults to the mobilesdk_app_id value specified in the google-services.json file for the current package name. For an iOS Application, defaults to the GOOGLE_APP_ID from GoogleService-Info.plist.",
        ),
      issue_count: z
        .number()
        .optional()
        .describe("Number of issues that needs to be fetched. Defaults to 10 if unspecified."),
      issue_type: z
        .enum(["FATAL", "NON-FATAL", "ANR"])
        .optional()
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
      requiresProject: true,
    },
  },
  async ({ app_id, issue_type, issue_count }, { projectId }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);

    issue_type ??= "FATAL";
    issue_count ??= 10;

    return toContent(await listTopIssues(projectId, app_id, issue_type, issue_count));
  },
);
