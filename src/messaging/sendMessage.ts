import { messagingApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { Message, Notification } from "./interfaces";

const TIMEOUT = 10000;

const apiClient = new Client({
  urlPrefix: messagingApiOrigin(),
  apiVersion: "v1",
});

/**
 * Function to send a message to an FCM Token.
 * @param projectId Project ID to which this token belongs to.
 * @param options Parameters including message body and target.
 * @return {Promise} Returns a promise fulfilled with a unique message ID string
 * after the message has been successfully handed off to the FCM service for delivery.
 */
export async function sendFcmMessage(
  projectId: string,
  options: {
    topic?: string;
    token?: string;
    title?: string;
    body?: string;
    image?: string;
  },
): Promise<string> {
  if (!options.token && !options.topic) {
    throw new FirebaseError("Must supply either token or topic to send FCM message.");
  }
  try {
    const notification: Notification = {
      title: options.title,
      body: options.body,
      image: options.image,
    };
    const message: Message = options.token
      ? {
          token: options.token!,
          notification: notification,
        }
      : {
          topic: options.topic!,
          notification: notification,
        };
    const messageData = {
      message: message,
    };
    const res = await apiClient.request<null, { name: string }>({
      method: "POST",
      path: `/projects/${projectId}/messages:send`,
      body: JSON.stringify(messageData),
      timeout: TIMEOUT,
    });
    return res.body.name;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to send message to '${options.token || options.topic}' for the project '${projectId}'. `,
      { original: err },
    );
  }
}
