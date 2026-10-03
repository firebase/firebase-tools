import * as clc from "colorette";
import * as ora from "ora";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { confirm } from "../prompt";
import { requireAuth } from "../requireAuth";
import * as cloudbilling from "../gcp/cloudbilling";
import { parseProjectNumber } from "../crashlytics/utils";
import {
  createBucketName,
  DEFAULT_BUCKET_LOCATION,
  DEFAULT_FILE_TTL_DAYS,
  ensureHeapDumpP4saRole,
  ensureHeapDumpStorageBucket,
  resolveAndroidAppId,
  updateProfilingManagerConfig,
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
    `the location for the Cloud Storage bucket (default: ${DEFAULT_BUCKET_LOCATION})`,
    DEFAULT_BUCKET_LOCATION,
  )
  .option("--force", "automatically configure without prompting for confirmation")
  .before(requireAuth)
  .action(async (options: CommandOptions) => {
    const projectId = needProjectId(options);
    const appId = await resolveAndroidAppId(projectId, options);
    const projectNumber = parseProjectNumber(appId);
    const location = options.location || DEFAULT_BUCKET_LOCATION;

    // 1. Verify project billing is enabled (required for GCS bucket creation and storage)
    const isBillingEnabled = await cloudbilling.checkBillingEnabled(projectId);
    if (!isBillingEnabled) {
      throw new FirebaseError(
        `Project '${projectId}' does not have billing enabled. Crashlytics Heap Dump Collection requires a metered (Blaze) billing plan for Google Cloud Storage.\n` +
          `To enable billing, visit: https://console.firebase.google.com/project/${projectId}/usage/details`,
      );
    }

    // 2. Derive deterministic bucket name
    const bucketName = createBucketName(appId);

    // 3. Confirm with user if running interactively without --force
    const confirmed = await confirm({
      message: `Enable Crashlytics heap dump collection for ${appId} using Cloud Storage bucket '${bucketName}' in ${location} (with ${DEFAULT_FILE_TTL_DAYS}-day file TTL)?`,
      default: true,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });

    if (!confirmed) {
      logger.info("Heap dump collection enablement canceled.");
      return;
    }

    // 4. Provision / configure GCS bucket and IAM roles
    const spinner = ora("Configuring Google Cloud Storage bucket...").start();
    try {
      await ensureHeapDumpStorageBucket(projectId, appId, location);
      spinner.text = "Configuring service agent permissions...";
      await ensureHeapDumpP4saRole(projectId, projectNumber);
      spinner.text = "Enabling Crashlytics heap dump collection...";
      await updateProfilingManagerConfig(appId, {
        gcsBucket: bucketName,
        heapDumpCollectionEnabled: true,
      });
      spinner.succeed("Successfully enabled Crashlytics heap dump collection!");
    } catch (err: unknown) {
      spinner.fail("Failed to enable Crashlytics heap dump collection.");
      throw err;
    }

    logger.info("");
    logger.info(clc.bold("Heap Dump Collection Details:"));
    logger.info(`  App ID:     ${clc.cyan(appId)}`);
    logger.info(`  GCS Bucket: ${clc.cyan(bucketName)}`);
    logger.info(`  File TTL:   ${clc.cyan(`${DEFAULT_FILE_TTL_DAYS} days`)}`);
    logger.info(`  Status:     ${clc.green("Enabled")}`);
    logger.info("");
    logger.info(
      `View collected heap dumps in the Firebase Console: https://console.firebase.google.com/project/${projectId}/crashlytics/app/${appId}`,
    );

    return {
      appId,
      bucketName,
      heapDumpCollectionEnabled: true,
    };
  });
