import { ensure } from "../ensureApiEnabled";
import { FirebaseError, getErrMsg } from "../error";
import * as experiments from "../experiments";
import { checkBillingEnabled, enableBilling } from "../gcp/cloudbilling";
import {
  createOrUpdateLogBucket,
  createOrUpdateLogSink,
  LogBucket,
  LogSink,
} from "../gcp/cloudlogging";
import { AlertPolicy } from "../gcp/cloudmonitoring";
import { enableAlerts } from "./alerts";
import { createOrUpdateTelemetryConfig, TelemetryConfig } from "./firebasetelemetry";
import { AlertType } from "./types";
import { logLabeledBullet, logLabeledSuccess, logLabeledWarning } from "../utils";
import { updateAppApiKeyRestriction } from "../gcp/apikeys";
import { provisionTraceStorage } from "../gcp/cloudtrace";
import { AppPlatform, getAppConfig } from "../management/apps";
import { logger } from "../logger";
import { checkbox } from "../prompt";
import { requireAuth } from "../requireAuth";

export const CRASHLYTICS_TELEMETRY_BUCKET_ID = "firebase-telemetry";
export const CRASHLYTICS_TELEMETRY_SINK_ID = "firebase-telemetry-routing";
export const CRASHLYTICS_TELEMETRY_RESOURCE_TYPE = "firebasetelemetry.googleapis.com/App";
export const CRASHLYTICS_TELEMETRY_SERVICE = "firebasetelemetry.googleapis.com";

export interface OnboardWebResult {
  bucket: LogBucket;
  sink: LogSink;
  config: TelemetryConfig;
  alertPolicies?: AlertPolicy[];
}

export interface OnboardWebOptions {
  nonInteractive?: boolean;
  user?: { email?: string };
}

async function resolveAuthenticatedUserEmail(
  options: OnboardWebOptions,
): Promise<string | undefined> {
  if (options.user?.email) {
    return options.user.email;
  }
  try {
    return (await requireAuth(options)) ?? undefined;
  } catch (err: unknown) {
    logger.debug(`[crashlytics] Failed to resolve authenticated user email: ${getErrMsg(err)}`);
    return undefined;
  }
}

/**
 * Onboards a Firebase Web App to Crashlytics by enabling required APIs,
 * setting up Cloud Logging bucket and sink routing, provisioning Cloud Trace storage, creating a Telemetry Config, and optionally configuring Crashlytics email alerts.
 */
export async function onboardCrashlyticsWeb(
  projectId: string,
  appId: string,
  options: OnboardWebOptions = {},
): Promise<OnboardWebResult> {
  const billingEnabled = await checkBillingEnabled(projectId);
  if (!billingEnabled && options.nonInteractive) {
    throw new FirebaseError(
      `Crashlytics requires the Blaze plan, but project ${projectId} is not on the Blaze plan. ` +
        `Please visit https://console.cloud.google.com/billing/linkedaccount?project=${projectId} to upgrade your project.`,
    );
  } else if (!billingEnabled) {
    await enableBilling(projectId, "Crashlytics");
  }

  logLabeledBullet("crashlytics", "Enabling required telemetry APIs...");
  const requiredApis = [
    ensure(projectId, CRASHLYTICS_TELEMETRY_SERVICE, "crashlytics", false),
    ensure(projectId, "firebasetelemetryadmin.googleapis.com", "crashlytics", false),
  ];
  if (experiments.isEnabled("crashlyticsWebTrace")) {
    requiredApis.push(ensure(projectId, "cloudtrace.googleapis.com", "crashlytics", false));
  }
  await Promise.all(requiredApis);
  logLabeledSuccess("crashlytics", "Telemetry APIs enabled.");

  const appConfig = await getAppConfig(appId, AppPlatform.WEB);
  if ("apiKey" in appConfig && appConfig.apiKey) {
    logLabeledBullet(
      "crashlytics",
      "Ensuring Crashlytics Telemetry API is permitted in API key restrictions...",
    );
    try {
      await updateAppApiKeyRestriction({
        apiKey: appConfig.apiKey,
        service: CRASHLYTICS_TELEMETRY_SERVICE,
      });
      logLabeledSuccess("crashlytics", "API key restrictions updated for Crashlytics Telemetry.");
    } catch (err: unknown) {
      logLabeledWarning("crashlytics", err instanceof Error ? err.message : String(err));
    }
  } else {
    logLabeledWarning(
      "crashlytics",
      `No API key found for this app. If you configure an API key later, ` +
        `please rerun this command or manually add '${CRASHLYTICS_TELEMETRY_SERVICE}' to its allowed APIs in the Google Cloud Console if the key is restricted.`,
    );
  }

  logLabeledBullet(
    "crashlytics",
    `Setting up Cloud Logging bucket '${CRASHLYTICS_TELEMETRY_BUCKET_ID}'...`,
  );
  const bucket = await createOrUpdateLogBucket(
    projectId,
    CRASHLYTICS_TELEMETRY_BUCKET_ID,
    "global",
    true,
  );
  logLabeledSuccess("crashlytics", "Cloud Logging bucket configured.");

  const destination = `logging.googleapis.com/projects/${projectId}/locations/global/buckets/${CRASHLYTICS_TELEMETRY_BUCKET_ID}`;
  const filter = `resource.type="${CRASHLYTICS_TELEMETRY_RESOURCE_TYPE}"`;
  logLabeledBullet(
    "crashlytics",
    `Setting up Cloud Logging routing sink '${CRASHLYTICS_TELEMETRY_SINK_ID}'...`,
  );
  const sink = await createOrUpdateLogSink(
    projectId,
    CRASHLYTICS_TELEMETRY_SINK_ID,
    destination,
    filter,
  );
  logLabeledSuccess("crashlytics", "Cloud Logging routing sink configured.");

  if (experiments.isEnabled("crashlyticsWebTrace")) {
    logLabeledBullet("crashlytics", "Provisioning Cloud Trace storage...");
    try {
      await provisionTraceStorage(projectId);
      logLabeledSuccess("crashlytics", "Cloud Trace storage provisioned.");
    } catch (err: unknown) {
      logLabeledWarning("crashlytics", getErrMsg(err));
    }
  }

  logLabeledBullet("crashlytics", "Configuring Crashlytics telemetry for web app...");
  const config = await createOrUpdateTelemetryConfig(
    projectId,
    appId,
    `projects/${projectId}/locations/global/buckets/${CRASHLYTICS_TELEMETRY_BUCKET_ID}`,
    1,
  );
  logLabeledSuccess("crashlytics", "Crashlytics telemetry configured successfully.");

  if (!experiments.isEnabled("crashlyticsWebAlerts") || options.nonInteractive) {
    return { bucket, sink, config };
  }

  const userEmail = await resolveAuthenticatedUserEmail(options);
  if (!userEmail) {
    logLabeledWarning(
      "crashlytics",
      "Unable to determine authenticated user email for alert setup. You can configure alerts later in the Firebase Console.",
    );
    return { bucket, sink, config };
  }

  const selectedAlerts = await checkbox<AlertType>({
    message: "Which email alerts would you like to enable? (Optional)",
    choices: [
      {
        name: "New issues (Notify when a new issue is detected)",
        value: AlertType.ALERT_TYPE_NEW_ISSUE,
        checked: true,
      },
      {
        name: "Regressed issues (Notify when a closed issue reoccurs)",
        value: AlertType.ALERT_TYPE_REGRESSED_ISSUE,
        checked: true,
      },
    ],
  });

  if (selectedAlerts.length === 0) {
    return { bucket, sink, config };
  }

  logLabeledBullet("crashlytics", `Setting up Crashlytics email alerts for ${userEmail}...`);
  try {
    const alertPolicies = await enableAlerts(projectId, appId, selectedAlerts, userEmail);
    logLabeledSuccess("crashlytics", "Crashlytics email alerts configured successfully.");
    return { bucket, sink, config, alertPolicies };
  } catch (err: unknown) {
    logLabeledWarning("crashlytics", getErrMsg(err));
    return { bucket, sink, config };
  }
}
