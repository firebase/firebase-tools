import * as fs from "fs";
import * as path from "path";
import { FirebaseError, getErrStatus } from "../../error";
import * as gcs from "../../gcp/storage";
import { getProjectNumber } from "../../getProjectNumber";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { logLabeledBullet, logLabeledWarning } from "../../utils";
import { Context } from "./args";
import { createArchive } from "./util";

/**
 * Zips and uploads App Hosting source code to Google Cloud Storage in preparation for
 * build and deployment. Creates storage buckets if necessary.
 */
export default async function (context: Context, options: Options): Promise<void> {
  if (context.backendConfigs.size === 0) {
    return;
  }
  const projectId = needProjectId(options);
  options.projectNumber = await getProjectNumber(options);
  if (!context.backendConfigs) {
    return;
  }

  // Ensure that a bucket exists in each region that a backend is or will be deployed to
  for (const loc of context.backendLocations.values()) {
    const bucketName = `firebaseapphosting-sources-${options.projectNumber}-${loc.toLowerCase()}`;
    try {
      await gcs.getBucket(bucketName);
    } catch (err) {
      const errStatus = getErrStatus((err as FirebaseError).original);
      // Unfortunately, requests for a non-existent bucket from the GCS API sometimes return 403 responses as well as 404s.
      // We must attempt to create a new bucket on both 403s and 404s.
      if (errStatus === 403 || errStatus === 404) {
        logLabeledBullet(
          "apphosting",
          `Creating Cloud Storage bucket in ${loc} to store App Hosting source code uploads at ${bucketName}...`,
        );
        try {
          await gcs.createBucket(projectId, {
            name: bucketName,
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
          });
        } catch (err) {
          if (getErrStatus((err as FirebaseError).original) === 403) {
            logLabeledWarning(
              "apphosting",
              "Failed to create Cloud Storage bucket because user does not have sufficient permissions. " +
                "See https://cloud.google.com/storage/docs/access-control/iam-roles for more details on " +
                "IAM roles that are able to create a Cloud Storage bucket, and ask your project administrator " +
                "to grant you one of those roles.",
            );
            throw (err as FirebaseError).original;
          }
        }
      } else {
        throw err;
      }
    }
  }

  for (const cfg of context.backendConfigs.values()) {
    let rootDir;
    if (cfg.localBuild) {
      rootDir = context.backendLocalBuilds[cfg.backendId].buildDir;
      if (!rootDir) {
	throw new FirebaseError(`No local build dir found for ${cfg.backendId}`);
      }
    } else {
      rootDir = options.projectRoot ?? process.cwd();
    }
    const zippedSourcePath = await createArchive(cfg, rootDir);
    logLabeledBullet("apphosting",`Zipped ${rootDir}`);

    const backendLocation = context.backendLocations.get(cfg.backendId);
    if (!backendLocation) {
      throw new FirebaseError(
        `Failed to find location for backend ${cfg.backendId}. Please contact support with the contents of your firebase-debug.log to report your issue.`,
      );
    }
    logLabeledBullet(
      "apphosting",
      `Uploading ${rootDir} for backend ${cfg.backendId}...`,
    );
    const gcsBucketName = `firebaseapphosting-${cfg.localBuild ? "build" : "sources"}-${options.projectNumber}-${backendLocation.toLowerCase()}`;
    const { bucket, object } = await gcs.uploadObject(
      {
        file: zippedSourcePath,
        stream: fs.createReadStream(zippedSourcePath),
      },
      gcsBucketName,
    );
    logLabeledBullet("apphosting", `Source code uploaded at gs://${bucket}/${object}`);
    context.backendStorageUris.set(
      cfg.backendId,
      `gs://${gcsBucketName}/${path.basename(zippedSourcePath)}`,
    );
  }
}
