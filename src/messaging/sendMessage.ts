import { messagingApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { Notification, TokenMessage, TopicMessage } from "./interfaces";

const TIMEOUT = 10000;

const apiClient = new Client({
  urlPrefix: messagingApiOrigin(),
  apiVersion: "v1",
});

/**
 * Function to send a message to an FCM Token.
 * @param projectId Project ID to which this token belongs to.
 * @param fcmToken The FCM Token to send to.
 * @param title The title of the message.
 * @param body The body of the message.
 * @return {Promise} Returns a promise fulfilled with a unique message ID string
 * after the message has been successfully handed off to the FCM service for delivery.
 */
export async function sendMessageToFcmToken(
  projectId: string,
  fcmToken: string,
  title?: string,
  body?: string,
): Promise<string> {
  try {
    const notification: Notification = {
      title: title,
      body: body,
    };
    const message: TokenMessage = {
      token: fcmToken,
      notification: notification,
    };
    const messageData = {
      message: message,
    };
    const res = await apiClient.request<null, string>({
      method: "POST",
      path: `/projects/${projectId}/messages:send`,
      body: JSON.stringify(messageData),
      timeout: TIMEOUT,
    });
    return res.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to send message to ${fcmToken} for the project ${projectId}. `,
      { original: err },
    );
  }
}

/**
 * Function to send a message to an FCM topic. This will initiate a message fanout to the topic members.
 * @param projectId Project ID to which this token belongs to.
 * @param fcmToken The FCM Token to send to.
 * @param title The title of the message.
 * @param body The body of the message.
 * @return {Promise} Returns a promise fulfilled with a unique message ID string
 * after the message has been successfully handed off to the FCM service for delivery.
 */
export async function sendMessageToFcmTopic(
  projectId: string,
  topic: string,
  title?: string,
  body?: string,
): Promise<string> {
  try {
    const notification: Notification = {
      title: title,
      body: body,
    };
    const message: TopicMessage = {
      topic: topic,
      notification: notification,
    };
    const messageData = {
      message: message,
    };
    const res = await apiClient.request<null, string>({
      method: "POST",
      path: `/projects/${projectId}/messages:send`,
      body: JSON.stringify(messageData),
      timeout: TIMEOUT,
    });
    return res.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(`Failed to send message for the project ${projectId}. `, {
      original: err,
    });
  }
}
