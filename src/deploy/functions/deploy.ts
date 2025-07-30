import { setGracefulCleanup } from "tmp";
import * as clc from "colorette";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createWriteStream } from "fs";
import * as archiver from "archiver";

import { checkHttpIam } from "./checkIam";
import { logLabeledWarning, logSuccess, logWarning } from "../../utils";
import { logger } from "../../logger";
import { Options } from "../../options";
import { configForCodebase } from "../../functions/projectConfig";
import * as args from "./args";
import * as gcs from "../../gcp/storage";
import * as gcf from "../../gcp/cloudfunctions";
import * as gcfv2 from "../../gcp/cloudfunctionsv2";
import * as backend from "./backend";
import { findEndpoint } from "./backend";
import { deploy as extDeploy } from "../extensions";
import { Delegate as DartDelegate } from "./runtimes/dart";
import { archiveDirectory } from "../../archiveDirectory";

setGracefulCleanup();

async function uploadSourceV1(
  projectId: string,
  source: args.Source,
  wantBackend: backend.Backend,
): Promise<string | undefined> {
  const v1Endpoints = backend.allEndpoints(wantBackend).filter((e) => e.platform === "gcfv1");
  if (v1Endpoints.length === 0) {
    return;
  }
  const region = v1Endpoints[0].region; // Just pick a region to upload the source.
  const uploadUrl = await gcf.generateUploadUrl(projectId, region);
  const uploadOpts = {
    file: source.functionsSourceV1!,
    stream: fs.createReadStream(source.functionsSourceV1!),
  };
  if (process.env.GOOGLE_CLOUD_QUOTA_PROJECT) {
    logLabeledWarning(
      "functions",
      "GOOGLE_CLOUD_QUOTA_PROJECT is not usable when uploading source for Cloud Functions.",
    );
  }
  await gcs.upload(
    uploadOpts,
    uploadUrl,
    {
      "x-goog-content-length-range": "0,104857600",
    },
    true, // ignoreQuotaProject
  );
  return uploadUrl;
}

async function uploadSourceV2(
  projectId: string,
  source: args.Source,
  wantBackend: backend.Backend,
): Promise<gcfv2.StorageSource | undefined> {
  const v2Endpoints = backend.allEndpoints(wantBackend).filter((e) => e.platform === "gcfv2");
  if (v2Endpoints.length === 0) {
    return;
  }
  const region = v2Endpoints[0].region; // Just pick a region to upload the source.
  const res = await gcfv2.generateUploadUrl(projectId, region);
  const uploadOpts = {
    file: source.functionsSourceV2!,
    stream: fs.createReadStream(source.functionsSourceV2!),
  };
  if (process.env.GOOGLE_CLOUD_QUOTA_PROJECT) {
    logLabeledWarning(
      "functions",
      "GOOGLE_CLOUD_QUOTA_PROJECT is not usable when uploading source for Cloud Functions.",
    );
  }
  await gcs.upload(uploadOpts, res.uploadUrl, undefined, true /* ignoreQuotaProject */);
  return res.storageSource;
}

async function uploadSourceCloudRun(
  projectId: string,
  source: args.Source,
  wantBackend: backend.Backend,
  sourceDir: string,
): Promise<string | undefined> {
  const runEndpoints = backend.allEndpoints(wantBackend).filter((e) => e.platform === "run");
  if (runEndpoints.length === 0) {
    return;
  }

  // TODO: Handle multiple regions - for now just use first endpoint's region
  const endpoint = runEndpoints[0];
  const region = endpoint.region;
  const runtime = endpoint.runtime;

  // Create temp directory for build artifacts
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "functions-build-"));

  try {
    // Compile Dart to native executable
    logLabeledWarning("functions", `Compiling Dart to native executable...`);
    // Note: sourceDir is already the absolute path to the source directory
    const projectDir = path.resolve("."); // Get project root
    logger.debug(`Project directory: ${projectDir}`);
    logger.debug(`Source directory: ${sourceDir}`);
    const delegate = new DartDelegate(projectId, projectDir, sourceDir, runtime);
    await delegate.compileToExecutable(tempDir);

    // Create tar.gz with the executable
    const exePath = path.join(tempDir, "server");
    
    // Use existing archiveDirectory but with just our binary
    const binaryDir = path.join(tempDir, "archive");
    await fs.promises.mkdir(binaryDir);
    await fs.promises.copyFile(exePath, path.join(binaryDir, "server"));
    
    const archive = await archiveDirectory(binaryDir);

    // Upload to GCS bucket for Cloud Run
    const bucketName = `run-sources-${projectId}-${region}`;
    const timestamp = Date.now();
    const objectPath = `functions/${endpoint.id}/${timestamp}/source.tar.gz`;
    
    logLabeledWarning("functions", `Uploading to gs://${bucketName}/${objectPath}`);
    
    // Ensure the bucket exists
    try {
      await gcs.getBucket(bucketName);
    } catch (err: any) {
      if (err?.status === 404) {
        logLabeledWarning("functions", `Creating Cloud Storage bucket ${bucketName}...`);
        await gcs.createBucket(projectId, {
          name: bucketName,
          location: region,
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
      } else {
        throw err;
      }
    }

    // Upload the tar.gz archive
    const { object } = await gcs.uploadObject(
      {
        file: objectPath,
        stream: archive.stream,
      },
      bucketName,
    );

    return `gs://${bucketName}/${objectPath}`;
  } finally {
    // Cleanup temp directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

async function uploadCodebase(
  context: args.Context,
  codebase: string,
  wantBackend: backend.Backend,
): Promise<void> {
  const source = context.sources?.[codebase];
  if (!source) {
    return;
  }

  const config = configForCodebase(context.config!, codebase);
  const sourceDir = path.resolve(config.source);

  // Handle Cloud Run deployments separately
  if (backend.someEndpoint(wantBackend, (e) => e.platform === "run")) {
    const cloudRunUrl = await uploadSourceCloudRun(context.projectId, source, wantBackend, sourceDir);
    if (cloudRunUrl) {
      source.sourceUrl = cloudRunUrl;
    }
    return;
  }

  if (!source.functionsSourceV1 && !source.functionsSourceV2) {
    return;
  }

  const uploads: Promise<unknown>[] = [];
  try {
    uploads.push(uploadSourceV1(context.projectId, source, wantBackend));
    uploads.push(uploadSourceV2(context.projectId, source, wantBackend));

    const [sourceUrl, storage] = await Promise.all(uploads);
    if (sourceUrl) {
      source.sourceUrl = sourceUrl as string;
    }
    if (storage) {
      source.storage = storage as gcfv2.StorageSource;
    }

    if (uploads.length) {
      logSuccess(
        `${clc.green(clc.bold("functions:"))} ${clc.bold(config.source)} folder uploaded successfully`,
      );
    }
  } catch (err: any) {
    logWarning(clc.yellow("functions:") + " Upload Error: " + err.message);
    throw err;
  }
}

/**
 * The "deploy" stage for Cloud Functions -- uploads source code to a generated URL.
 * @param context The deploy context.
 * @param options The command-wide options object.
 * @param payload The deploy payload.
 */
export async function deploy(
  context: args.Context,
  options: Options,
  payload: args.Payload,
): Promise<void> {
  // Deploy extensions
  if (payload.extensions && context.extensions) {
    await extDeploy(context.extensions, options, payload.extensions);
  }

  // Deploy functions
  if (payload.functions && context.config) {
    await checkHttpIam(context, options, payload);
    const uploads: Promise<void>[] = [];
    for (const [codebase, { wantBackend, haveBackend }] of Object.entries(payload.functions)) {
      if (shouldUploadBeSkipped(context, wantBackend, haveBackend)) {
        continue;
      }
      uploads.push(uploadCodebase(context, codebase, wantBackend));
    }
    await Promise.all(uploads);
  }
}

/**
 * @return True IFF wantBackend + haveBackend are the same
 */
export function shouldUploadBeSkipped(
  context: args.Context,
  wantBackend: backend.Backend,
  haveBackend: backend.Backend,
): boolean {
  // If function targets are specified by --only flag, assume that function will be deployed
  // and go ahead and upload the source.
  if (context.filters && context.filters.length > 0) {
    return false;
  }
  const wantEndpoints = backend.allEndpoints(wantBackend);
  const haveEndpoints = backend.allEndpoints(haveBackend);

  // Mismatching length immediately tells us they are different, and we should not skip.
  if (wantEndpoints.length !== haveEndpoints.length) {
    return false;
  }

  return wantEndpoints.every((wantEndpoint) => {
    const haveEndpoint = findEndpoint(haveBackend, (endpoint) => endpoint.id === wantEndpoint.id);
    if (!haveEndpoint) {
      return false;
    }
    return haveEndpoint.hash && wantEndpoint.hash && haveEndpoint.hash === wantEndpoint.hash;
  });
}
