import * as fs from "fs";
import * as path from "path";
import { FirebaseError } from "../../error";
import * as gcs from "../../gcp/storage";
import { getProjectNumber } from "../../getProjectNumber";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { logLabeledBullet } from "../../utils";
import { Context } from "./args";
import { createArchive } from "./util";

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
  await Promise.all(
    Object.values(context.backendLocations).map(async (loc) => {
      const bucketName = `firebaseapphosting-sources-${options.projectNumber}-${loc.toLowerCase()}`;
      await gcs.upsertBucket({
        product: "apphosting",
        createMessage: `Creating Cloud Storage bucket in ${loc} to store App Hosting source code uploads at ${bucketName}...`,
        projectId,
        req: {
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
        },
      });
    }),
  );

  await Promise.all(
    Object.values(context.backendConfigs).map(async (cfg) => {
      const projectSourcePath = options.projectRoot ? options.projectRoot : process.cwd();
      const zippedSourcePath = await createArchive(cfg, projectSourcePath);
      const backendLocation = context.backendLocations[cfg.backendId];
      if (!backendLocation) {
        throw new FirebaseError(
          `Failed to find location for backend ${cfg.backendId}. Please contact support with the contents of your firebase-debug.log to report your issue.`,
        );
      }
      logLabeledBullet(
        "apphosting",
        `Uploading source code at ${projectSourcePath} for backend ${cfg.backendId}...`,
      );
      const bucketName = `firebaseapphosting-sources-${options.projectNumber}-${backendLocation.toLowerCase()}`;
      const { bucket, object } = await gcs.uploadObject(
        {
          file: zippedSourcePath,
          stream: fs.createReadStream(zippedSourcePath),
        },
        bucketName,
      );
      logLabeledBullet("apphosting", `Source code uploaded at gs://${bucket}/${object}`);
      context.backendStorageUris[cfg.backendId] =
        `gs://${bucketName}/${path.basename(zippedSourcePath)}`;
    }),
  );
}
