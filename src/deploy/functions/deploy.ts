import { setGracefulCleanup } from "tmp";
import * as clc from "cli-color";
import * as fs from "fs";

import { checkHttpIam } from "./checkIam";
import { logSuccess, logWarning } from "../../utils";
import { Options } from "../../options";
import { FirebaseError } from "../../error";
import { configForCodebase } from "../../functions/projectConfig";
import * as args from "./args";
import * as gcs from "../../gcp/storage";
import * as gcf from "../../gcp/cloudfunctions";
import * as gcfv2 from "../../gcp/cloudfunctionsv2";
import * as backend from "./backend";

setGracefulCleanup();

async function uploadSourceV1(
  projectId: string,
  source: args.Source,
  wantBackend: backend.Backend
): Promise<string | undefined> {
  const v1Endpoints = backend.allEndpoints(wantBackend).filter((e) => e.platform === "gcfv1");
  if (v1Endpoints.length === 0) {
    return;
  }
  const region = backend.allEndpoints(wantBackend)[0].region; // Just pick a region to upload the source.
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

async function uploadSourceRegionV2(
  projectId: string,
  source: args.Source,
  region: string
): Promise<gcfv2.StorageSource> {
  const res = await gcfv2.generateUploadUrl(projectId, region);
  const uploadOpts = {
    file: source.functionsSourceV2!,
    stream: fs.createReadStream(source.functionsSourceV2!),
  };
  await gcs.upload(uploadOpts, res.uploadUrl);
  return res.storageSource;
}

async function uploadSourceV2(
  projectId: string,
  source: args.Source,
  b: backend.Backend
): Promise<Record<string, gcfv2.StorageSource> | undefined> {
  // GCFv2 cares about data residency and will possibly block deploys coming from other
  // regions. At minimum, the implementation would consider it user-owned source and
  // would break download URLs + console source viewing.
  const uploads: Promise<Record<string, gcfv2.StorageSource>>[] = [];
  const regions = Object.keys(b.endpoints);
  for (const region of regions) {
    if (backend.regionalEndpoints(b, region).some((e) => e.platform === "gcfv2")) {
      uploads.push(
        (async (): Promise<Record<string, gcfv2.StorageSource>> => {
          const storage = await uploadSourceRegionV2(projectId, source, region);
          return { [region]: storage };
        })()
      );
    }
  }

  const regionalStorages = await Promise.all(uploads);
  let storage: Record<string, gcfv2.StorageSource> = {};
  for (const region of regionalStorages) {
    storage = { ...storage, ...region };
  }
  if (Object.keys(storage).length < 1) {
    return;
  }
  return storage;
}

function assertPreconditions(context: args.Context, options: Options, payload: args.Payload): void {
  const assertExists = function (v: unknown, msg?: string): void {
    const errMsg = `${msg || "Value unexpectedly empty."}`;
    if (!v) {
      throw new FirebaseError(
        errMsg +
          "This should never happen. Please file a bug at https://github.com/firebase/firebase-tools"
      );
    }
  };
  assertExists(context.config, "Functions config unexpectedly empty.");
  assertExists(context.sources, "Functions sources unexpectedly empty.");
  for (const source of Object.values(context.sources || {})) {
    assertExists(
      source.functionsSourceV1 || source.functionsSourceV2,
      "Functions source (v1 & v2) both unexpectedly empty."
    );
  }
  assertExists(payload.codebase, "Functions payload unexpectedly empty.");
}

async function uploadCodebase(
  context: args.Context,
  codebase: string,
  wantBackend: backend.Backend
) {
  const uploads: Promise<unknown>[] = [];
  const source = context.sources![codebase];
  if (!source) {
    throw new FirebaseError("TODO FIX Me");
  }

  try {
    uploads.push(uploadSourceV1(context.projectId, source, wantBackend));
    uploads.push(uploadSourceV2(context.projectId, source, wantBackend));

    const [sourceUrl, storage] = await Promise.all(uploads);
    if (sourceUrl) {
      source.sourceUrl = sourceUrl as string;
    }
    if (storage) {
      source.storage = storage as Record<string, gcfv2.StorageSource>;
    }

    const sourceDir = configForCodebase(context.config!, codebase).source;
    if (uploads.length) {
      logSuccess(
        `${clc.green.bold("functions:")} ${clc.bold(sourceDir)} folder uploaded successfully`
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
  payload: args.Payload
): Promise<void> {
  assertPreconditions(context, options, payload);
  await checkHttpIam(context, options, payload);
  const uploads: Promise<void>[] = [];
  for (const codebase of Object.keys(payload.codebase!)) {
    uploads.push(uploadCodebase(context, codebase, payload.codebase![codebase].wantBackend));
  }
  await Promise.all(uploads);
}
