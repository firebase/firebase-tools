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

// -----------------------------------------------------------------------------
// FM Delivery Data Interfaces
// -----------------------------------------------------------------------------

/**
 * Additional information about [proxy notification] delivery.
 * All percentages are calculated with 'countNotificationsAccepted' as the denominator.
 */
export interface ProxyNotificationInsightPercents {
  /** The percentage of accepted notifications that were successfully proxied. */
  proxied?: number;
  /** The percentage of accepted notifications that failed to be proxied. */
  failed?: number;
  /** The percentage of accepted notifications that were skipped because proxy notification is unsupported for the recipient. */
  skippedUnsupported: number;
  /** The percentage of accepted notifications that were skipped because the messages were not throttled. */
  skippedNotThrottled: number;
  /** The percentage of accepted notifications that were skipped because configurations required for notifications to be proxied were missing. */
  skippedUnconfigured: number;
  /** The percentage of accepted notifications that were skipped because the app disallowed these messages to be proxied. */
  skippedOptedOut: number;
}

/**
 * Additional information about message delivery. All percentages are calculated
 * with 'countMessagesAccepted' as the denominator.
 */
export interface MessageInsightPercents {
  /** The percentage of accepted messages that had their priority lowered from high to normal. */
  priorityLowered: number;
}

/**
 * Overview of delivery performance for messages that were successfully delivered.
 * All percentages are calculated with 'countMessagesAccepted' as the denominator.
 */
export interface DeliveryPerformancePercents {
  /** The percentage of accepted messages that were delivered to the device without delay from the FCM system. */
  deliveredNoDelay: number;
  /** The percentage of accepted messages that were delayed because the target device was not connected at the time of sending. */
  delayedDeviceOffline: number;
  /** The percentage of accepted messages that were delayed because the device was in doze mode. */
  delayedDeviceDoze: number;
  /** The percentage of accepted messages that were delayed due to message throttling. */
  delayedMessageThrottled: number;
  /** The percentage of accepted messages that were delayed because the intended device user-profile was stopped. */
  delayedUserStopped: number;
}

/**
 * Percentage breakdown of message delivery outcomes. These categories are mutually exclusive.
 * All percentages are calculated with 'countMessagesAccepted' as the denominator.
 */
export interface MessageOutcomePercents {
  /** The percentage of all accepted messages that were successfully delivered to the device. */
  delivered: number;
  /** The percentage of messages accepted that were not dropped and not delivered, due to the device being disconnected. */
  pending: number;
  /** The percentage of accepted messages that were collapsed by another message. */
  collapsed: number;
  /** The percentage of accepted messages that were dropped due to too many undelivered non-collapsible messages. */
  droppedTooManyPendingMessages: number;
  /** The percentage of accepted messages that were dropped because the application was force stopped. */
  droppedAppForceStopped: number;
  /** The percentage of accepted messages that were dropped because the target device is inactive. */
  droppedDeviceInactive: number;
  /** The percentage of accepted messages that expired because Time To Live (TTL) elapsed. */
  droppedTtlExpired: number;
}

/**
 * Data detailing messaging delivery
 */
export interface Data {
  /** Count of messages accepted by FCM intended for Android devices. */
  countMessagesAccepted: string; // Use string for int64 to prevent potential precision issues
  /** Count of notifications accepted by FCM intended for Android devices. */
  countNotificationsAccepted: string; // Use string for int64
  /** Mutually exclusive breakdown of message delivery outcomes. */
  messageOutcomePercents: MessageOutcomePercents;
  /** Additional information about delivery performance for messages that were successfully delivered. */
  deliveryPerformancePercents: DeliveryPerformancePercents;
  /** Additional general insights about message delivery. */
  messageInsightPercents: MessageInsightPercents;
  /** Additional insights about proxy notification delivery. */
  proxyNotificationInsightPercents: ProxyNotificationInsightPercents;
}

// -----------------------------------------------------------------------------
// Core API Interfaces
// -----------------------------------------------------------------------------

/**
 * Message delivery data for a given date, app, and analytics label combination.
 */
export interface AndroidDeliveryData {
  /** The app ID to which the messages were sent. */
  appId: string;
  /** The date represented by this entry. */
  date: {
    year: number;
    month: number;
    day: number;
  };
  /** The analytics label associated with the messages sent. */
  analyticsLabel: string;
  /** The data for the specified combination. */
  data: Data;
}

/**
 * Response message for ListAndroidDeliveryData.
 */
export interface ListAndroidDeliveryDataResponse {
  /**
   * The delivery data for the provided app.
   * There will be one entry per combination of app, date, and analytics label.
   */
  androidDeliveryData: AndroidDeliveryData[];
  /**
   * A token, which can be sent as `page_token` to retrieve the next page.
   * If this field is omitted, there are no subsequent pages.
   */
  nextPageToken?: string;
}
