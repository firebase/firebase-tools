import { setGracefulCleanup } from "tmp";
import * as clc from "colorette";
import * as fs from "fs";

import { checkHttpIam } from "./checkIam";
import { logSuccess, logWarning } from "../../utils";
import { Options } from "../../options";
import { configForCodebase } from "../../functions/projectConfig";
import * as args from "./args";
import * as gcs from "../../gcp/storage";
import * as gcf from "../../gcp/cloudfunctions";
import * as gcfv2 from "../../gcp/cloudfunctionsv2";
import * as backend from "./backend";
import { findEndpoint } from "./backend";

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
  await gcs.upload(uploadOpts, uploadUrl, {
    "x-goog-content-length-range": "0,104857600",
  });
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
  await gcs.upload(uploadOpts, res.uploadUrl);
  return res.storageSource;
}

async function uploadCodebase(
  context: args.Context,
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
    uploads.push(uploadSourceV2(context.projectId, source, wantBackend));

    const [sourceUrl, storage] = await Promise.all(uploads);
    if (sourceUrl) {
      source.sourceUrl = sourceUrl as string;
    }
    if (storage) {
      source.storage = storage as gcfv2.StorageSource;
    }

    const sourceDir = configForCodebase(context.config!, codebase).source;
    if (uploads.length) {
      logSuccess(
        `${clc.green(clc.bold("functions:"))} ${clc.bold(sourceDir)} folder uploaded successfully`,
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
  if (!context.config) {
    return;
  }

  if (!payload.functions) {
    return;
  }

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
