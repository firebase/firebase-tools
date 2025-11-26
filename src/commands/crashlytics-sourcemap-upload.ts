import * as fs from "fs";
import * as path from "path";
import { statSync } from "fs-extra";
import { readdirRecursive } from "../fsAsync";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { commandExistsSync, logLabeledBullet, logLabeledWarning } from "../utils";
import { needProjectId } from "../projectUtils";
import * as gcs from "../gcp/storage";
import { getProjectNumber } from "../getProjectNumber";
import { Options } from "../options";
import { archiveFile } from "../archiveFile";
import { execSync } from "node:child_process";

interface CommandOptions extends Options {
  app?: string;
  bucketLocation?: string;
  appVersion?: string;
}

export const command = new Command("crashlytics:sourcemap:upload <mappingFiles>")
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
  .action(async (mappingFiles: string, options: CommandOptions) => {
    checkGoogleAppID(options);

    // App version
    const appVersion = getAppVersion(options);

    // Get project identifiers
    const projectId = needProjectId(options);
    const projectNumber = await getProjectNumber(options);

    // Upsert default GCS bucket
    const bucketName = await upsertBucket(projectId, projectNumber, options);

    // Find and upload mapping files
    const rootDir = options.projectRoot ?? process.cwd();
    const filePath = path.relative(rootDir, mappingFiles);
    let fstat: fs.Stats;
    try {
      fstat = statSync(filePath);
    } catch (e) {
      throw new FirebaseError(
        "provide a valid file path or directory to mapping file(s), e.g. app/build/outputs/app.js.map or app/build/outputs",
      );
    }
    let successCount = 0;
    let failureCount = 0;
    if (fstat.isFile()) {
      const success = await uploadMap(mappingFiles, bucketName, appVersion, options);
      success ? successCount++ : failureCount++;
    } else if (fstat.isDirectory()) {
      logLabeledBullet("crashlytics", "Looking for mapping files in your directory...");
      const files = (
        await readdirRecursive({ path: filePath, ignore: ["node_modules", ".git"], maxDepth: 20 })
      ).filter((f) => f.name.endsWith(".js.map"));
      (
        await Promise.all(files.map((f) => uploadMap(f.name, bucketName, appVersion, options)))
      ).forEach((success) => {
        success ? successCount++ : failureCount++;
      });
    } else {
      throw new FirebaseError(
        "provide a valid file path or directory to mapping file(s), e.g. app/build/outputs/app.js.map or app/build/outputs",
      );
    }
    logLabeledBullet(
      "crashlytics",
      `Uploaded ${successCount} (${failureCount} failed) mapping files to ${bucketName}`,
    );

    // TODO: notify Firebase Telemetry service of the new mapping file
  });

function checkGoogleAppID(options: CommandOptions): void {
  if (!options.app) {
    throw new FirebaseError(
      "set --app <appId> to a valid Firebase application id, e.g. 1:00000000:android:0000000",
    );
  }
}

function getAppVersion(options: CommandOptions): string {
  if (options.appVersion) {
    return options.appVersion;
  }
  const gitCommit = getGitCommit();
  if (gitCommit) {
    logLabeledBullet("crashlytics", `Using git commit as app version: ${gitCommit}`);
    return gitCommit;
  }
  const packageVersion = getPackageVersion();
  if (packageVersion) {
    logLabeledBullet("crashlytics", `Using package version as app version: ${packageVersion}`);
    return packageVersion;
  }
  return "unset";
}

async function upsertBucket(
  projectId: string,
  projectNumber: string,
  options: CommandOptions,
): Promise<string> {
  let loc: string = "US-CENTRAL1";
  if (options.bucketLocation) {
    loc = (options.bucketLocation as string).toUpperCase();
  } else {
    logLabeledBullet(
      "crashlytics",
      "No Google Cloud Storage bucket location specified. Defaulting to US-CENTRAL1.",
    );
  }

  const baseName = `firebasecrashlytics-sourcemaps-${projectNumber}-${loc.toLowerCase()}`;
  return await gcs.upsertBucket({
    product: "crashlytics",
    createMessage: `Creating Cloud Storage bucket in ${loc} to store Crashlytics source maps at ${baseName}...`,
    projectId,
    req: {
      baseName,
      purposeLabel: `crashlytics-sourcemaps-${loc.toLowerCase()}`,
      location: loc,
      lifecycle: {
        rule: [
          {
            action: {
              type: "Delete",
            },
            condition: {
              age: 30,
            },
          },
        ],
      },
    },
  });
}

async function uploadMap(
  mappingFile: string,
  bucketName: string,
  appVersion: string,
  options: CommandOptions,
): Promise<boolean> {
  try {
    const filePath = path.relative(options.projectRoot ?? process.cwd(), mappingFile);
    const tmpArchive = await archiveFile(filePath, { archivedFileName: "mapping.js.map" });
    const gcsFile = `${options.app}-${appVersion}-${normalizeFileName(mappingFile)}.zip`;

    const { bucket, object } = await gcs.uploadObject(
      {
        file: gcsFile,
        stream: fs.createReadStream(tmpArchive),
      },
      bucketName,
    );
    logger.debug(`Uploaded mapping file ${mappingFile} to gs://${bucket}/${object}`);
    return true;
  } catch (e) {
    logLabeledWarning("crashlytics", `Failed to upload mapping file ${mappingFile}:\n${e}`);
    return false;
  }
}

function normalizeFileName(fileName: string): string {
  return fileName.replaceAll(/\//g, "-");
}

function getGitCommit(): string | undefined {
  if (!commandExistsSync("git")) {
    return undefined;
  }
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch (error) {
    return undefined;
  }
}

function getPackageVersion(): string | undefined {
  if (!commandExistsSync("npm")) {
    return undefined;
  }
  try {
    return execSync("npm pkg get version").toString().trim().replaceAll('"', "");
  } catch (error) {
    return undefined;
  }
}
