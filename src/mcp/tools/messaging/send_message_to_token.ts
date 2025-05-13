import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { sendMessageToToken } from "../../../messaging/sendMessage.js";

export const send_message_to_token = tool(
  {
    name: "send_message_to_token",
    description: "Sends a message to FCM Token",
    inputSchema: z.object({
      fcmToken: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      imageUrl: z.string().optional()
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
  async ({ fcmToken, title, body, imageUrl }, { projectId }) => {
    if (projectId === undefined) {
      return mcpError(`No projectId specified in the send_message_to_token tool`);
    }
    return toContent(await sendMessageToToken(projectId, fcmToken, title, body, imageUrl));
  },
);