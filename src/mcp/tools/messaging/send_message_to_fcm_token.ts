import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { sendMessageToFcmToken } from "../../../messaging/sendMessage.js";

export const send_message_to_fcm_token = tool(
  {
    name: "send_message_to_fcm_token",
    description: "Sends a message to FCM Token",
    inputSchema: z.object({
      fcmToken: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
    }),
    annotations: {
      title: "Send message to FCM Token",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ fcmToken, title, body }, { projectId }) => {
    if (fcmToken === undefined) {
      return mcpError(`No fcmToken specified in the send_message_to_fcm_token tool`);
    }
    return toContent(await sendMessageToFcmToken(projectId!, fcmToken, title, body));
  },
);
