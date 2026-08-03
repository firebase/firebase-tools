import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { getAndroidDeliveryData } from "../../../messaging/getDeliveryData";

export const get_fcm_delivery_data = tool(
  "messaging",
  {
    name: "get_fcm_delivery_data",
    description: "Gets FCM's delivery data",
    inputSchema: z.object({
      appId: z.string().describe("appId to fetch data for"),
      pageSize: z.number().optional().describe("How many results to fetch"),
      pageToken: z.string().optional().describe("Next page token"),
    }),
    annotations: {
      title: "Fetch FCM Delivery Data",
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ appId, pageSize, pageToken }, { projectId }) => {
    if (!appId.includes(":android:")) {
      return mcpError(
        `Invalid app id provided: ${appId}. Currently fcm delivery data is only available for android apps.`,
      );
    }

    return toContent(await getAndroidDeliveryData(projectId, appId, { pageSize, pageToken }));
  },
);
