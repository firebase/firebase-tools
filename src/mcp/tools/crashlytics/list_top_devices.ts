import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { listTopDevices } from "../../../crashlytics/listTopDevices";

export const list_top_devices = tool(
  {
    name: "list_top_devices",
    description: "List the top devices from Crashlytics for an application.",
    inputSchema: z.object({
      app_id: z
        .string()
        .optional()
        .describe(
          "AppId for which the devices list should be fetched. For an Android application, read the mobilesdk_app_id value specified in the google-services.json file for the current package name. For an iOS Application, read the GOOGLE_APP_ID from GoogleService-Info.plist. If neither is available, use the `firebase_list_apps` tool to find an app_id to pass to this tool.",
        ),
      device_count: z
        .number()
        .optional()
        .default(10)
        .describe("Number of devices that needs to be fetched. Defaults to 10 if unspecified."),
    }),
    annotations: {
      title: "List Top Crashlytics Devices.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ app_id, device_count }, { projectId }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);

    device_count ??= 10;
    return toContent(await listTopDevices(projectId, app_id, device_count));
  },
);
