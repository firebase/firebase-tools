import { FirebaseError, getErrMsg, getError, getErrStatus } from "../error";
import {
  AlertPolicy,
  createNotificationChannel,
  getAlertPolicy,
  listNotificationChannels,
  NotificationChannel,
  updateAlertPolicy,
} from "../gcp/cloudmonitoring";
import { logger } from "../logger";
import { AlertType, GenerateAlertPolicyResponse } from "./types";
import { CRASHLYTICS_API_CLIENT, TIMEOUT } from "./utils";

/**
 * User label marking a notification channel as created by Firebase.
 */
export const FIREBASE_CHANNEL_LABEL = "is_firebase_channel";

/**
 * Suffix appended to the email address to build a Firebase channel's display name.
 */
export const FIREBASE_EMAIL_CHANNEL_DISPLAY_NAME_SUFFIX = " - for Firebase alerts";

/**
 * Cloud Monitoring notification channel type for email delivery.
 */
export const EMAIL_CHANNEL_TYPE = "email";

/**
 * Field mask path for updating the notification channels list on an AlertPolicy.
 */
export const NOTIFICATION_CHANNELS_MASK_PATH = "notification_channels";

/**
 * Generates an AlertPolicy in Cloud Monitoring via the Crashlytics Alert Policy service.
 * @param projectId The GCP project ID or project number.
 * @param appId The Firebase App ID.
 * @param alertType The specific type of Crashlytics alert (e.g., ALERT_TYPE_NEW_ISSUE).
 * @return The Cloud Monitoring AlertPolicy resource name.
 */
export async function generateAlertPolicy(
  projectId: string,
  appId: string,
  alertType: AlertType,
): Promise<string> {
  logger.debug(
    `[crashlytics] generateAlertPolicy called with projectId: ${projectId}, appId: ${appId}, alertType: ${alertType}`,
  );
  try {
    const response = await CRASHLYTICS_API_CLIENT.request<
      { alertType: AlertType },
      GenerateAlertPolicyResponse
    >({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${projectId}/apps/${appId}:generateAlertPolicy`,
      body: { alertType },
      timeout: TIMEOUT,
    });
    return response.body.alertPolicy;
  } catch (err: unknown) {
    const status = getErrStatus(err);
    const msg = getErrMsg(err);
    throw new FirebaseError(
      `Failed to generate Crashlytics alert policy for ${alertType} on app ${appId} (status ${status}): ${msg}`,
      { original: getError(err), status },
    );
  }
}

/**
 * Fetches the Firebase-owned notification channel for the user's email if it exists.
 * Returns undefined if no such channel is configured yet.
 */
export async function fetchFirebaseEmailChannel(
  projectId: string,
  userEmail: string,
): Promise<NotificationChannel | undefined> {
  const escapedEmail = userEmail.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const filter =
    `type = "${EMAIL_CHANNEL_TYPE}" AND ` +
    `labels.email_address = "${escapedEmail}" AND ` +
    `user_labels.${FIREBASE_CHANNEL_LABEL} = "true"`;
  const channels = await listNotificationChannels(projectId, filter);
  return channels[0];
}

/**
 * Creates a new Firebase-owned email notification channel for the given user email.
 */
export async function createEmailChannel(
  projectId: string,
  userEmail: string,
): Promise<NotificationChannel> {
  return await createNotificationChannel(projectId, {
    type: EMAIL_CHANNEL_TYPE,
    displayName: `${userEmail}${FIREBASE_EMAIL_CHANNEL_DISPLAY_NAME_SUFFIX}`,
    labels: {
      email_address: userEmail,
    },
    userLabels: {
      [FIREBASE_CHANNEL_LABEL]: "true",
    },
  });
}

/**
 * Resolves the Firebase email notification channel for the given user email,
 * reusing an existing channel if present or creating one otherwise.
 */
export async function resolveEmailNotificationChannel(
  projectId: string,
  userEmail: string,
): Promise<NotificationChannel> {
  const existingChannel = await fetchFirebaseEmailChannel(projectId, userEmail);
  return existingChannel ?? (await createEmailChannel(projectId, userEmail));
}

/**
 * Adds a notification channel resource name to an AlertPolicy if not already present.
 */
export function addChannelToPolicy(policy: AlertPolicy, channelName: string): AlertPolicy {
  const currentChannels = policy.notificationChannels ?? [];
  if (currentChannels.includes(channelName)) {
    return policy;
  }
  return {
    ...policy,
    notificationChannels: [...currentChannels, channelName],
  };
}

/**
 * Generates (or resolves) the AlertPolicy for a Crashlytics alert type and attaches
 * the specified notification channel (or resolves the channel for userEmail).
 */
export async function enableAlert(
  projectId: string,
  appId: string,
  alertType: AlertType,
  target: { channelName: string; userEmail?: never } | { channelName?: never; userEmail: string },
): Promise<{ channel?: NotificationChannel; policy: AlertPolicy }> {
  let channel: NotificationChannel | undefined;
  if (!target.channelName && target.userEmail) {
    channel = await resolveEmailNotificationChannel(projectId, target.userEmail);
  } else if (!target.channelName) {
    throw new FirebaseError(
      "Either channelName or userEmail must be specified to enable a Crashlytics alert.",
      { exit: 1 },
    );
  }
  const channelName = target.channelName ?? channel?.name;
  if (!channelName) {
    throw new FirebaseError("Resolved notification channel is missing a resource name.", {
      exit: 1,
    });
  }

  const policyResourceName = await generateAlertPolicy(projectId, appId, alertType);
  const targetPolicy = await getAlertPolicy(policyResourceName);
  const policyWithChannel = addChannelToPolicy(targetPolicy, channelName);
  const updatedPolicy =
    policyWithChannel === targetPolicy
      ? targetPolicy
      : await updateAlertPolicy(policyWithChannel, NOTIFICATION_CHANNELS_MASK_PATH);

  return { channel, policy: updatedPolicy };
}

/**
 * Enables one or more Crashlytics alert types for the given user email,
 * resolving the Firebase email notification channel once and attaching it to each generated policy.
 */
export async function enableAlerts(
  projectId: string,
  appId: string,
  alertTypes: AlertType[],
  userEmail: string,
): Promise<AlertPolicy[]> {
  if (alertTypes.length === 0) {
    return [];
  }
  const channel = await resolveEmailNotificationChannel(projectId, userEmail);
  const channelName = channel.name;
  if (!channelName) {
    throw new FirebaseError("Notification channel for Crashlytics alerts is missing a name.", {
      exit: 1,
    });
  }
  const results = await Promise.allSettled(
    alertTypes.map(async (alertType) => {
      const { policy } = await enableAlert(projectId, appId, alertType, {
        channelName,
      });
      return policy;
    }),
  );
  const policies: AlertPolicy[] = [];
  for (const res of results) {
    if (res.status === "fulfilled") {
      policies.push(res.value);
    } else {
      logger.debug(`[crashlytics] Failed to enable alert: ${getErrMsg(res.reason)}`);
    }
  }
  return policies;
}
