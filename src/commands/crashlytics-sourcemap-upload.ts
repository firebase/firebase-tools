import * as fs from "fs";
import * as path from "path";
import { statSync } from "fs-extra";
import { readdirRecursive } from "../fsAsync";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { logLabeledBullet } from "../utils";
import { needProjectId } from "../projectUtils";
import { getProjectNumber } from "../getProjectNumber";
import { requireAuth } from "../requireAuth";
import {
  CommandOptions,
  checkGoogleAppID,
  getAppVersion,
  upsertBucket,
  findSourceMapMappings,
  uploadSourceMaps,
} from "../crashlytics/sourcemap";

export const command = new Command("crashlytics:sourcemap:upload [mappingFiles]")
  .description("upload javascript source maps to de-minify stack traces")
  .option("--app <appID>", "the app id of your Firebase app")
  .option(
    "--bucket-location <bucketLocation>",
    'the location of the Google Cloud Storage bucket (default: "US-CENTRAL1"',
  )
  .option(
    "--app-version <appVersion>",
    "the version of your Firebase app (defaults to Git commit hash, if available)",
  )
  .before(requireAuth)
  .action(async (mappingFiles: string | undefined, options: CommandOptions) => {
    checkGoogleAppID(options);

    // App version
    const appVersion = getAppVersion(options);

    // Get project identifiers
    const projectId = needProjectId(options);
    const projectNumber = await getProjectNumber(options);

    // Upsert default GCS bucket
    const bucketName = await upsertBucket(projectId, projectNumber, options);

    // Find and upload mapping files
    const rootDir = path.resolve(options.projectRoot ?? process.cwd());
    const filePath = mappingFiles ? path.resolve(mappingFiles) : rootDir;

    let fstat: fs.Stats;
    try {
      fstat = statSync(filePath);
    } catch (e) {
      throw new FirebaseError(
        "provide a valid directory to mapping file(s), e.g. app/build/outputs",
      );
    }
    let successCount = 0;
    const failedFiles: string[] = [];
    if (fstat.isDirectory()) {
      logLabeledBullet("crashlytics", "Looking for mapping files in your directory...");
      const files = await readdirRecursive({
        path: filePath,
        ignoreStrings: ["node_modules", ".git"],
        maxDepth: 20,
      });

      const mappings = await findSourceMapMappings(files, rootDir);

      const result = await uploadSourceMaps(mappings, {
        projectId,
        bucketName,
        appVersion,
        options,
      });
      successCount = result.successCount;
      failedFiles.push(...result.failedFiles);
    } else {
      throw new FirebaseError(
        "provide a valid directory to mapping file(s), e.g. app/build/outputs",
      );
    }
    logLabeledBullet(
      "crashlytics",
      `Uploaded ${successCount} (${failedFiles.length} failed) mapping files to ${bucketName}`,
    );
    if (failedFiles.length > 0) {
      logLabeledBullet(
        "crashlytics",
        `Could not upload the following files:\n${failedFiles.join("\n")}`,
      );
    }
  });
