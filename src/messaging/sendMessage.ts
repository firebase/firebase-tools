import { messagingApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { Message, Notification, TokenMessage } from "./interfaces";

const TIMEOUT = 10000;


const apiClient = new Client({
    urlPrefix: messagingApiOrigin(),
    apiVersion: "v1",
});

/**
 * Function to send a Message Request to FCM.
 * @param projectId Input is the project ID string
 * @param message Message to send
 * @return {Promise} Returns a promise fulfilled with a unique message ID string 
 * after the message has been successfully handed off to the FCM service for delivery.
 */
export async function sendMessageToToken(
    projectId: string,
    token: string,
    title?: string,
    body?: string,
    imageUrl?: string,
): Promise<string> {
    try {
        const notification: Notification = {
            title: title,
            body: body,
            imageUrl: imageUrl
        }
        const message: TokenMessage = {
            token: token,
            notification: notification
        }
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
            `Failed to send message for the project ${projectId}. `,
            { original: err },
        );
    }
}
