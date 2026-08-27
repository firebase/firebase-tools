import { ensure } from "../ensureApiEnabled";
import { FirebaseError } from "../error";
import { checkBillingEnabled, enableBilling } from "../gcp/cloudbilling";
import {
  createOrUpdateLogBucket,
  createOrUpdateLogSink,
  grantLogViewAccess,
  LogBucket,
  LogSink,
} from "../gcp/cloudlogging";
import { createOrUpdateTelemetryConfig, TelemetryConfig } from "./firebasetelemetry";
import { logLabeledBullet, logLabeledSuccess } from "../utils";

export const CRASHLYTICS_TELEMETRY_BUCKET_ID = "firebase-telemetry";
export const CRASHLYTICS_TELEMETRY_SINK_ID = "firebase-telemetry-routing";
export const CRASHLYTICS_TELEMETRY_RESOURCE_TYPE = "firebasetelemetry.googleapis.com/App";
export const CRASHLYTICS_TELEMETRY_VIEW_ID = "_AllLogs";
export const CRASHLYTICS_TELEMETRY_VIEW_ACCESSOR_ROLE = "roles/logging.viewAccessor";

export interface OnboardWebResult {
  bucket: LogBucket;
  sink: LogSink;
  config: TelemetryConfig;
}

/**
 * Onboards a Firebase Web App to Crashlytics by enabling required APIs,
 * setting up Cloud Logging bucket and sink routing, granting view accessor permissions,
 * and creating a Telemetry Config.
 */
export async function onboardCrashlyticsWeb(
  projectId: string,
  appId: string,
  options: { nonInteractive?: boolean } = {},
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
  await Promise.all([
    ensure(projectId, "firebasetelemetry.googleapis.com", "crashlytics", false),
    ensure(projectId, "firebasetelemetryadmin.googleapis.com", "crashlytics", false),
  ]);
  logLabeledSuccess("crashlytics", "Telemetry APIs enabled.");

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

  logLabeledBullet(
    "crashlytics",
    `Granting view accessor permission on bucket '${CRASHLYTICS_TELEMETRY_BUCKET_ID}' to project viewers and editors...`,
  );
  await grantLogViewAccess(
    projectId,
    CRASHLYTICS_TELEMETRY_BUCKET_ID,
    CRASHLYTICS_TELEMETRY_VIEW_ID,
    [`projectViewer:${projectId}`, `projectEditor:${projectId}`],
    CRASHLYTICS_TELEMETRY_VIEW_ACCESSOR_ROLE,
    "global",
  );
  logLabeledSuccess("crashlytics", "Cloud Logging view permissions configured.");

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

  logLabeledBullet("crashlytics", "Configuring Crashlytics telemetry for web app...");
  const config = await createOrUpdateTelemetryConfig(
    projectId,
    appId,
    `projects/${projectId}/locations/global/buckets/${CRASHLYTICS_TELEMETRY_BUCKET_ID}`,
    1,
  );
  logLabeledSuccess("crashlytics", "Crashlytics telemetry configured successfully.");

  return { bucket, sink, config };
}
