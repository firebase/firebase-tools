import * as fs from "fs";
import * as path from "path";
import { FirebaseError } from "../../error";
import * as gcs from "../../gcp/storage";
import { getProjectNumber } from "../../getProjectNumber";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { logLabeledBullet } from "../../utils";
import { Context } from "./args";
import { createArchive, createTarArchive } from "./util";

/**
 * Zips and uploads App Hosting source code to Google Cloud Storage in preparation for
 * build and deployment. Creates storage buckets if necessary.
 */
export default async function (context: Context, options: Options): Promise<void> {
  if (Object.entries(context.backendConfigs).length === 0) {
    return;
  }
  const projectId = needProjectId(options);
  options.projectNumber = await getProjectNumber(options);
  if (!context.backendConfigs) {
    return;
  }

  // Ensure that a bucket exists in each region that a backend is or will be deployed to
  const bucketsPerLocation: Record<string, string> = {};
  await Promise.all(
    Object.entries(context.backendLocations).map(async ([backendId, loc]) => {
      const cfg = context.backendConfigs[backendId];
      if (!cfg) {
        throw new FirebaseError(
          `Failed to find config for backend ${backendId}. Please contact support with the contents of your firebase-debug.log to report your issue.`,
        );
      }
      const baseName = `firebaseapphosting-sources-${options.projectNumber}-${loc.toLowerCase()}`;
      const resolvedName = await gcs.upsertBucket({
        product: "apphosting",
        createMessage: `Creating Cloud Storage bucket in ${loc} to store App Hosting source code uploads at ${baseName}...`,
        projectId,
        req: {
          baseName,
          purposeLabel: `apphosting-source-${loc.toLowerCase()}`,
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
      bucketsPerLocation[loc] = resolvedName;
    }),
  );

  // Zip and upload code to GCS bucket.
  await Promise.all(
    Object.values(context.backendConfigs).map(async (cfg) => {
      const rootDir = options.projectRoot ?? process.cwd();
      let builtAppDir;
      if (cfg.localBuild) {
        builtAppDir = context.backendLocalBuilds[cfg.backendId].buildDir;
        if (!builtAppDir) {
          throw new FirebaseError(`No local build dir found for ${cfg.backendId}`);
        }
      }
      const zippedSourcePath = await createTarArchive(cfg, rootDir, builtAppDir);
      logLabeledBullet(
        "apphosting....",
        `Zipped ${cfg.localBuild ? "built app" : "source"} for backend ${cfg.backendId}`,
      );

      const backendLocation = context.backendLocations[cfg.backendId];
      if (!backendLocation) {
        throw new FirebaseError(
          `Failed to find location for backend ${cfg.backendId}. Please contact support with the contents of your firebase-debug.log to report your issue.`,
        );
      }
      logLabeledBullet(
        "apphosting",
        `Uploading ${cfg.localBuild ? "built app" : "source"} for backend ${cfg.backendId}...`,
      );
      const bucketName = bucketsPerLocation[backendLocation]!;
      const { bucket, object } = await gcs.uploadObject(
        {
          file: zippedSourcePath,
          stream: fs.createReadStream(zippedSourcePath),
        },
        bucketName,
      );
      logLabeledBullet("apphosting", `Uploaded at gs://${bucket}/${object}`);
      context.backendStorageUris[cfg.backendId] =
        `gs://${bucketName}/${path.basename(zippedSourcePath)}`;
    }),
  );
}
