import { setGracefulCleanup } from "tmp";
import * as clc from "colorette";
import * as fs from "fs";

import { checkHttpIam } from "./checkIam";
import { logLabeledWarning, logLabeledSuccess, logWarning } from "../../utils";
import { Options } from "../../options";
import { configForCodebase } from "../../functions/projectConfig";
import * as args from "./args";
import * as gcs from "../../gcp/storage";
import * as gcf from "../../gcp/cloudfunctions";
import * as gcfv2 from "../../gcp/cloudfunctionsv2";
import * as backend from "./backend";
import * as experiments from "../../experiments";
import { findEndpoint } from "./backend";
import { deploy as extDeploy } from "../extensions";
import { getProjectNumber } from "../../getProjectNumber";
import * as path from "path";

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

// Trampoline to allow tests to mock out createStream.
/**
 *
 */
export function createReadStream(filePath: string): NodeJS.ReadableStream {
  return fs.createReadStream(filePath);
}

/**
 *
 */
export async function uploadSourceV2(
  projectId: string,
  projectNumber: string,
  source: args.Source,
  wantBackend: backend.Backend,
): Promise<gcfv2.StorageSource | undefined> {
  const v2Endpoints = backend
    .allEndpoints(wantBackend)
    .filter((e) => e.platform === "gcfv2" || e.platform === "run");
  if (v2Endpoints.length === 0) {
    return;
  }
  // N.B. Should we upload to multiple regions? For now, just pick the first one.
  // Uploading to multiple regions might slow upload and cost the user money if they
  // pay their ISP for bandwidth, but having a bucket per region would avoid cross-region
  // fees from GCP.
  const region = v2Endpoints[0].region; // Just pick a region to upload the source.
  const uploadOpts = {
    file: source.functionsSourceV2!,
    stream: (exports as { createReadStream: typeof createReadStream }).createReadStream(
      source.functionsSourceV2!,
    ),
  };

  // Legacy behavior: use the GCF API
  // We use BYO bucket if the "runfunctions" experiment is enabled OR if we have any platform: run endpoints.
  // Otherwise, we use the GCF API.
  if (!experiments.isEnabled("runfunctions") && !v2Endpoints.some((e) => e.platform === "run")) {
    if (process.env.GOOGLE_CLOUD_QUOTA_PROJECT) {
      logLabeledWarning(
        "functions",
        "GOOGLE_CLOUD_QUOTA_PROJECT is not usable when uploading source for Cloud Functions.",
      );
    }
    const res = await gcfv2.generateUploadUrl(projectId, region);
    await gcs.upload(uploadOpts, res.uploadUrl, undefined, true /* ignoreQuotaProject */);
    return res.storageSource;
  }

  // Future behavior: BYO bucket if we're using the Cloud Run API directly because it does not provide a source upload API.
  // We use this behavior whenever the "runfunctions" experiment is enabled for now just to help vet the codepath incrementally.
  // Using project number to ensure we don't exceed the bucket name length limit (in addition to PII controversy).
  const baseName = `firebase-functions-src-${projectNumber}`;
  const bucketName = await gcs.upsertBucket({
    product: "functions",
    projectId,
    createMessage: `Creating Cloud Storage bucket in ${region} to store Functions source code uploads at ${baseName}...`,
    req: {
      baseName,
      location: region,
      purposeLabel: `functions-source-${region.toLowerCase()}`,
      lifecycle: {
        rule: [
          {
            action: { type: "Delete" },
            // Delete objects after 1 day. A safe default to avoid unbounded storage costs;
            // consider making this configurable in the future.
            condition: { age: 1 },
          },
        ],
      },
    },
  });
  const objectPath = `${source.functionsSourceV2Hash}${path.extname(source.functionsSourceV2!)}`;
  await gcs.upload(
    uploadOpts,
    `${bucketName}/${objectPath}`,
    undefined,
    true /* ignoreQuotaProject */,
  );
  return {
    bucket: bucketName,
    object: objectPath,
  };
}

async function uploadCodebase(
  context: args.Context,
  projectNumber: string,
  codebase: string,
  wantBackend: backend.Backend,
): Promise<void> {
  const source = context.sources?.[codebase];
  if (!source || (!source.functionsSourceV1 && !source.functionsSourceV2)) {
    return;
  }

  const uploads: Promise<unknown>[] = [];
  try {
    uploads.push(uploadSourceV1(context.projectId, source, wantBackend));
    uploads.push(uploadSourceV2(context.projectId, projectNumber, source, wantBackend));

    const [sourceUrl, storage] = await Promise.all(uploads);
    if (sourceUrl) {
      source.sourceUrl = sourceUrl as string;
    }
    if (storage) {
      source.storage = storage as gcfv2.StorageSource;
    }

    const cfg = configForCodebase(context.config!, codebase);
    const label = cfg.source ?? cfg.remoteSource?.dir ?? "remote";
    if (uploads.length) {
      logLabeledSuccess("functions", `${clc.bold(label)} source uploaded successfully`);
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
      const projectNumber = options.projectNumber || (await getProjectNumber(context.projectId));
      uploads.push(uploadCodebase(context, projectNumber, codebase, wantBackend));
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
    return (
      haveEndpoint.hash &&
      wantEndpoint.hash &&
      haveEndpoint.hash === wantEndpoint.hash &&
      haveEndpoint.state === "ACTIVE"
    );
  });
}
