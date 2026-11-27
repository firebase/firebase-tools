export interface BaseMessage {
  notification?: Notification;
}

export interface TokenMessage extends BaseMessage {
  token: string;
}

export interface TopicMessage extends BaseMessage {
  topic: string;
}

/**
 * Payload for the {@link Messaging.send} operation. The payload contains all the fields
 * in the BaseMessage type, and exactly one of token, topic or condition.
 */
export type Message = TokenMessage | TopicMessage;

/**
 * A notification that can be included in {@link Message}.
 */
export interface Notification {
  /**
   * The title of the notification.
   */
  title?: string;
  /**
   * The notification body
   */
  body?: string;
  /** URL of an image to include in the notification. */
  image?: string;
}
