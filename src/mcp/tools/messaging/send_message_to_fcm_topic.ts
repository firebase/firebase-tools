import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { sendMessageToFcmTopic } from "../../../messaging/sendMessage.js";

export const send_message_to_fcm_topic = tool(
  {
    name: "send_message_to_fcm_topic",
    description: "Sends a message to an FCM Topic",
    inputSchema: z.object({
      topic: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
    }),
    annotations: {
      title: "Send message to an FCM Topic",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ topic, title, body }, { projectId }) => {
    if (topic === undefined) {
      return mcpError(`No topic specified in the send_message_to_fcm_topic tool`);
    }
    return toContent(await sendMessageToFcmTopic(projectId!, topic, title, body));
  },
);
