import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { getSampleCrash } from "../../../crashlytics/getSampleCrash.js";

export const get_sample_crash = tool(
  {
    name: "get_sample_crash_for_issue",
    description: "Gets the sample crash for an issue.",
    inputSchema: z.object({
      app_id: z
        .string()
        .optional()
        .describe(
          "AppId for which the issues list should be fetched. For an Android application, read the mobilesdk_app_id value specified in the google-services.json file for the current package name. For an iOS Application, read the GOOGLE_APP_ID from GoogleService-Info.plist. If neither is available, use the `firebase_list_apps` tool to find an app_id to pass to this tool.",
        ),
      issue_id: z
        .string()
        .optional()
        .describe(
          "The issue Id for which the sample crash needs to be fetched. This is the value of the field `id` in the list of issues. Defaults to the first id in the list of issues.",
        ),
      variant_id: z
        .string()
        .optional()
        .describe(
          "The variant Id that maps to an issue Id for which the sample crash needs to be fetched.",
        ),
      sample_count: z
        .number()
        .optional()
        .describe("Number of samples that needs to be fetched. Maximum value is 3. Defaults to 1.")
        .default(1),
    }),
    annotations: {
      title: "Gets a sample of a crash for a specific issue.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ app_id, issue_id, variant_id, sample_count }, { projectId }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);
    if (!issue_id) return mcpError(`Must specify 'issue_id' parameter.`);

    if (sample_count > 3) sample_count = 3;

    return toContent(await getSampleCrash(projectId, app_id, issue_id, variant_id, sample_count));
  },
);
