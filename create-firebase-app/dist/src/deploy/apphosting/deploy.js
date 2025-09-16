"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const error_1 = require("../../error");
const gcs = require("../../gcp/storage");
const getProjectNumber_1 = require("../../getProjectNumber");
const projectUtils_1 = require("../../projectUtils");
const utils_1 = require("../../utils");
const util_1 = require("./util");
/**
 * Zips and uploads App Hosting source code to Google Cloud Storage in preparation for
 * build and deployment. Creates storage buckets if necessary.
 */
async function default_1(context, options) {
    if (context.backendConfigs.size === 0) {
        return;
    }
    const projectId = (0, projectUtils_1.needProjectId)(options);
    options.projectNumber = await (0, getProjectNumber_1.getProjectNumber)(options);
    if (!context.backendConfigs) {
        return;
    }
    // Ensure that a bucket exists in each region that a backend is or will be deployed to
    for (const loc of context.backendLocations.values()) {
        const bucketName = `firebaseapphosting-sources-${options.projectNumber}-${loc.toLowerCase()}`;
        try {
            await gcs.getBucket(bucketName);
        }
        catch (err) {
            const errStatus = (0, error_1.getErrStatus)(err.original);
            // Unfortunately, requests for a non-existent bucket from the GCS API sometimes return 403 responses as well as 404s.
            // We must attempt to create a new bucket on both 403s and 404s.
            if (errStatus === 403 || errStatus === 404) {
                (0, utils_1.logLabeledBullet)("apphosting", `Creating Cloud Storage bucket in ${loc} to store App Hosting source code uploads at ${bucketName}...`);
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
                }
                catch (err) {
                    if ((0, error_1.getErrStatus)(err.original) === 403) {
                        (0, utils_1.logLabeledWarning)("apphosting", "Failed to create Cloud Storage bucket because user does not have sufficient permissions. " +
                            "See https://cloud.google.com/storage/docs/access-control/iam-roles for more details on " +
                            "IAM roles that are able to create a Cloud Storage bucket, and ask your project administrator " +
                            "to grant you one of those roles.");
                        throw err.original;
                    }
                }
            }
            else {
                throw err;
            }
        }
    }
    for (const cfg of context.backendConfigs.values()) {
        const { projectSourcePath, zippedSourcePath } = await (0, util_1.createArchive)(cfg, options.projectRoot);
        const backendLocation = context.backendLocations.get(cfg.backendId);
        if (!backendLocation) {
            throw new error_1.FirebaseError(`Failed to find location for backend ${cfg.backendId}. Please contact support with the contents of your firebase-debug.log to report your issue.`);
        }
        (0, utils_1.logLabeledBullet)("apphosting", `Uploading source code at ${projectSourcePath} for backend ${cfg.backendId}...`);
        const { bucket, object } = await gcs.uploadObject({
            file: zippedSourcePath,
            stream: fs.createReadStream(zippedSourcePath),
        }, `firebaseapphosting-sources-${options.projectNumber}-${backendLocation.toLowerCase()}`);
        (0, utils_1.logLabeledBullet)("apphosting", `Source code uploaded at gs://${bucket}/${object}`);
        context.backendStorageUris.set(cfg.backendId, `gs://firebaseapphosting-sources-${options.projectNumber}-${backendLocation.toLowerCase()}/${path.basename(zippedSourcePath)}`);
    }
}
exports.default = default_1;
