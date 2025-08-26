import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { listTopDevices } from "../../../crashlytics/listTopDevices";
import { APP_ID_FIELD } from "./constants";

export const list_top_devices = tool(
  {
    name: "list_top_devices",
    description: "List the top devices from Crashlytics for an application.",
    inputSchema: z.object({
      app_id: APP_ID_FIELD,
      issue_id: z.string().optional().describe("The issue id to filter on"),
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
    },
  },
  async ({ app_id, issue_id, device_count }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);

    device_count ??= 10;
    return toContent(await listTopDevices(app_id, device_count, issue_id));
  },
);
