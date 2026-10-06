import * as clc from "colorette";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { confirm } from "../prompt";
import { requireAuth } from "../requireAuth";
import { consoleUrl } from "../utils";
import * as cloudbilling from "../gcp/cloudbilling";
import {
  createBucketName,
  DEFAULT_BUCKET_LOCATION,
  DEFAULT_FILE_TTL_DAYS,
  enableHeapDumpCollection,
  resolveAndroidAppId,
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
  .withForce("automatically configure without prompting for confirmation")
  .before(requireAuth)
  .action(async (options: CommandOptions) => {
    const projectId = needProjectId(options);
    const appId = await resolveAndroidAppId(projectId, options);
    const location = options.location || DEFAULT_BUCKET_LOCATION;

    // 1. Verify project billing is enabled (required for GCS bucket creation and storage)
    const isBillingEnabled = await cloudbilling.checkBillingEnabled(projectId);
    if (!isBillingEnabled) {
      throw new FirebaseError(
        `Project '${projectId}' is not on the Blaze (pay-as-you-go) plan. Crashlytics heap dump collection requires the Blaze plan for Google Cloud Storage.\n` +
          `To upgrade your project, visit: ${consoleUrl(projectId, "/usage/details")}`,
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

    // 4. Provision / configure GCS bucket, IAM roles, and Profiling Manager config
    await enableHeapDumpCollection(projectId, appId, location);

    logger.info("");
    logger.info(clc.bold("Heap Dump Collection Details:"));
    logger.info(`  App ID:     ${clc.cyan(appId)}`);
    logger.info(`  GCS Bucket: ${clc.cyan(bucketName)}`);
    logger.info(`  File TTL:   ${clc.cyan(`${DEFAULT_FILE_TTL_DAYS} days`)}`);
    logger.info(`  Status:     ${clc.green("Enabled")}`);
    logger.info("");
    logger.info(
      `View collected heap dumps in the Firebase Console: ${consoleUrl(projectId, `/crashlytics/app/${appId}`)}`,
    );

    return {
      appId,
      bucketName,
      heapDumpCollectionEnabled: true,
    };
  });
