import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { logLabeledWarning } from "../utils";
import {
  getProfilingManagerConfig,
  HeapDumpBucketInfo,
  inspectHeapDumpBucket,
  parseBucketName,
  resolveAndroidAppId,
} from "../crashlytics/profilingManager";

interface CommandOptions extends Options {
  app?: string;
}

export const command = new Command("crashlytics:heapdumps:status")
  .description("get Crashlytics heap dump collection status and configuration for an Android app")
  .option("--app <appID>", "the app id of your Firebase Android app")
  .before(requireAuth)
  .action(async (options: CommandOptions) => {
    const projectId = needProjectId(options);
    const appId = await resolveAndroidAppId(projectId, options);

    const config = await getProfilingManagerConfig(appId);
    const heapDumpCollectionEnabled = Boolean(config?.heapDumpCollectionEnabled);
    const bucketName = parseBucketName(config?.bucket);

    let bucketInfo: HeapDumpBucketInfo | undefined;
    if (bucketName) {
      bucketInfo = await inspectHeapDumpBucket(bucketName);
      if (bucketInfo.exists === false) {
        logLabeledWarning(
          "crashlytics",
          `Configured Cloud Storage bucket '${bucketName}' was not found (it may have been deleted). Run 'firebase crashlytics:heapdumps:enable --app ${appId}' to recreate it.`,
        );
      } else if (bucketInfo.warning) {
        logLabeledWarning(
          "crashlytics",
          `Could not inspect Cloud Storage bucket '${bucketName}': ${bucketInfo.warning}`,
        );
      }
    }

    const statusCell =
      heapDumpCollectionEnabled && bucketInfo?.exists === false
        ? clc.yellow("Enabled (bucket missing)")
        : heapDumpCollectionEnabled
          ? clc.green("Enabled")
          : clc.red("Disabled");
    const bucketCell = !bucketName
      ? clc.yellow("(none)")
      : bucketInfo?.exists === false
        ? `${bucketName} ${clc.red("(not found)")}`
        : bucketName;
    const locationCell =
      bucketInfo?.location || (!bucketName ? clc.yellow("(none)") : clc.yellow("(unknown)"));
    const ttlCell =
      bucketInfo?.fileTtlDays !== undefined
        ? `${bucketInfo.fileTtlDays} days`
        : !bucketName || bucketInfo?.exists === true
          ? clc.yellow("(none)")
          : clc.yellow("(unknown)");

    const tableHead = [
      "App ID",
      "Collection Status",
      "Cloud Storage Bucket",
      "Location",
      "File TTL",
    ];
    const table = new Table({ head: tableHead, style: { head: ["green"] } });
    table.push([appId, statusCell, bucketCell, locationCell, ttlCell]);

    logger.info("");
    logger.info(table.toString());

    return {
      appId,
      ...(config?.name ? { name: config.name } : {}),
      ...(bucketName ? { bucketName } : {}),
      ...(bucketInfo?.exists !== undefined ? { bucketExists: bucketInfo.exists } : {}),
      ...(bucketInfo?.location ? { location: bucketInfo.location } : {}),
      ...(bucketInfo?.fileTtlDays !== undefined ? { fileTtlDays: bucketInfo.fileTtlDays } : {}),
      heapDumpCollectionEnabled,
    };
  });
