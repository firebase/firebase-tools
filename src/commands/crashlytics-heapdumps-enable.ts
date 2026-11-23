import * as clc from "colorette";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { confirm, isNonInteractive } from "../prompt";
import { requireAuth } from "../requireAuth";
import { consoleUrl } from "../utils";
import * as cloudbilling from "../gcp/cloudbilling";
import {
  createBucketName,
  DEFAULT_BUCKET_LOCATION,
  DEFAULT_FILE_TTL_DAYS,
  enableHeapDumpCollection,
  getCrashlyticsConsoleUrl,
  getProfilingManagerConfig,
  inspectHeapDumpBucket,
  parseBucketName,
  resolveAndroidApp,
} from "../crashlytics/profilingManager";

interface CommandOptions extends Options {
  app?: string;
  location?: string;
}

export const command = new Command("crashlytics:heapdumps:enable")
  .description("enable Crashlytics heap dump collection for an Android app")
  .option("--app <appID>", "the app id of your Firebase Android app")
  .option(
    "--location <location>",
    `the location for the Cloud Storage bucket (default: "${DEFAULT_BUCKET_LOCATION}")`,
  )
  .withForce("automatically configure without prompting for confirmation")
  .before(requireAuth)
  .action(async (options: CommandOptions) => {
    const projectId = needProjectId(options);
    const { appId, packageName } = await resolveAndroidApp(projectId, options);
    const explicitLocation = options.location?.trim() || undefined;

    // 1. Verify project billing is enabled (required for GCS bucket creation and storage)
    const isBillingEnabled = await cloudbilling.checkBillingEnabled(projectId);
    if (!isBillingEnabled) {
      throw new FirebaseError(
        `Project '${projectId}' is not on the Blaze (pay-as-you-go) plan. Crashlytics heap dump collection requires the Blaze plan for Google Cloud Storage.\n` +
          `To upgrade your project, visit: ${consoleUrl(projectId, "/usage/details")}`,
      );
    }

    // 2. Confirm with user if running interactively without --force.
    let targetBucketName: string | undefined;
    if (!options.force) {
      if (options.nonInteractive || isNonInteractive()) {
        throw new FirebaseError(
          "Cannot enable Crashlytics heap dump collection in non-interactive mode without confirmation. Re-run with '--force' to skip the confirmation prompt.",
        );
      }

      const existingConfig = await getProfilingManagerConfig(appId);
      targetBucketName = parseBucketName(existingConfig?.bucket) || createBucketName(appId);
      const preview = await inspectHeapDumpBucket(targetBucketName);
      const bucketQualifier = preview.exists ? "existing " : "";
      const previewLocation = preview.location || explicitLocation || DEFAULT_BUCKET_LOCATION;
      const previewTtlDays = preview.fileTtlDays ?? DEFAULT_FILE_TTL_DAYS;
      const confirmed = await confirm({
        message: `Enable Crashlytics heap dump collection for ${appId} using ${bucketQualifier}Cloud Storage bucket '${targetBucketName}' in ${previewLocation} (with ${previewTtlDays}-day file TTL)?`,
        force: options.force,
        nonInteractive: options.nonInteractive,
      });

      if (!confirmed) {
        logger.info("Heap dump collection enablement canceled.");
        return;
      }
    }

    // 3. Provision / configure GCS bucket, IAM roles, and Profiling Manager config
    const result = await enableHeapDumpCollection(
      projectId,
      appId,
      explicitLocation,
      targetBucketName,
    );

    logger.info("");
    logger.info(clc.bold("Heap Dump Collection Details:"));
    logger.info(`  App ID:     ${clc.cyan(appId)}`);
    logger.info(`  GCS Bucket: ${clc.cyan(result.bucketName)}`);
    if (result.location) {
      logger.info(`  Location:   ${clc.cyan(result.location)}`);
    }
    if (result.fileTtlDays !== undefined) {
      logger.info(`  File TTL:   ${clc.cyan(`${result.fileTtlDays} days`)}`);
    }
    logger.info(`  Status:     ${clc.green("Enabled")}`);
    logger.info("");
    logger.info(
      `View collected heap dumps in the Firebase Console: ${getCrashlyticsConsoleUrl(projectId, packageName)}`,
    );

    return {
      appId,
      bucketName: result.bucketName,
      ...(result.location ? { location: result.location } : {}),
      ...(result.fileTtlDays !== undefined ? { fileTtlDays: result.fileTtlDays } : {}),
      heapDumpCollectionEnabled: true,
    };
  });
