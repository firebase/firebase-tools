import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { listTopOperatingSystems } from "../../../crashlytics/listTopOperatingSystems";

export const list_top_operating_systems = tool(
  {
    name: "list_top_operating_systems",
    description: "List the top operating systems from Crashlytics for an application.",
    inputSchema: z.object({
      app_id: z
        .string()
        .optional()
        .describe(
          "AppId for which the operating systems list should be fetched. For an Android application, read the mobilesdk_app_id value specified in the google-services.json file for the current package name. For an iOS Application, read the GOOGLE_APP_ID from GoogleService-Info.plist. If neither is available, use the `firebase_list_apps` tool to find an app_id to pass to this tool.",
        ),
      os_count: z
        .number()
        .optional()
        .default(10)
        .describe(
          "Number of operating systems that needs to be fetched. Defaults to 10 if unspecified.",
        ),
    }),
    annotations: {
      title: "List Top Crashlytics Operating Systems.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ app_id, os_count }, { projectId }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);

    os_count ??= 10;
    return toContent(await listTopOperatingSystems(projectId, app_id, os_count));
  },
);
