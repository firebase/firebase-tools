import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { sendFcmMessage } from "../../../messaging/sendMessage";

export const send_message = tool(
  "messaging",
  {
    name: "send_message",
    description:
      "Use this to send a message to a Firebase Cloud Messaging registration token or topic. ONLY ONE of `registration_token` or `topic` may be supplied in a specific call.",
    inputSchema: z.object({
      registration_token: z
        .string()
        .optional()
        .describe(
          "A specific device registration token for delivery. Supply either this or topic.",
        ),
      topic: z
        .string()
        .optional()
        .describe("A topic name for delivery. Supply either this or registration_token."),
      title: z.string().optional().describe("The title of the push notification message."),
      body: z.string().optional().describe("The body of the push notification  message."),
      image: z
        .string()
        .optional()
        .describe(
          "The URL of an image that will be displayed with the notification. JPEG, PNG, BMP have full support across platforms. Animated GIF and video only work on iOS. WebP and HEIF have varying levels of support across platforms and platform versions.",
        ),
    }),
    annotations: {
      title: "Send FCM Message",
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ registration_token, topic, title, body }, { projectId }) => {
    if (!registration_token && !topic) {
      return mcpError(
        "Must supply either a `registration_token` or `topic` parameter to `send_message`.",
      );
    }
    if (registration_token && topic) {
      return mcpError(
        "Cannot supply both `registration_token` and `topic` in a single `send_message` request.",
      );
    }
    return toContent(
      await sendFcmMessage(projectId, { token: registration_token, topic, title, body }),
    );
  },
);
