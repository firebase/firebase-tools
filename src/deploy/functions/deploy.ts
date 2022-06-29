import { setGracefulCleanup } from "tmp";
import * as clc from "cli-color";
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
import crypto from "crypto";
import * as secrets from "../../functions/secrets";

setGracefulCleanup();

async function generateSourceHash(source: args.Source, wantBackend: backend.Backend): Promise<any> {
  const hash = crypto.createHash("sha256");
  const sourceFile = source.functionsSourceV2 || source.functionsSourceV1;
  // Hash the contents of the source file
  if (sourceFile) {
    const readStream = fs.createReadStream(sourceFile);
    readStream.pipe(hash);
    await new Promise((resolve, reject) => {
      hash.on("end", () => resolve(hash.read()));
      readStream.on("error", reject);
    });
  }

  // TODO(tystark) dotenv needs rework
  hash.push({
    ...process.env,
  });

  const endpointsById = Object.values(wantBackend.endpoints);
  const endpointsList: backend.Endpoint[] = endpointsById
    .map((endpoints) => Object.values(endpoints))
    .reduce((memo, endpoints) => [...memo, ...endpoints], []);
  const secretValues = secrets.of(endpointsList).reduce((memo, { secret, version }) => {
    if (version) {
      memo[secret] = version;
    }
    return memo;
  }, {} as Record<string, string>);
  hash.push(secretValues);

  return hash.read();
}

async function uploadSourceV1(
  projectId: string,
  source: args.Source,
  wantBackend: backend.Backend
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
  wantBackend: backend.Backend
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
  wantBackend: backend.Backend
): Promise<void> {
  const source = context.sources?.[codebase];
  if (!source || (!source.functionsSourceV1 && !source.functionsSourceV2)) {
    return;
  }

  const generatedHash = generateSourceHash(source, wantBackend);
  // TODO(tystark) - fetch the latest uploaded snapshot of the codebase.
  // TODO(tystark) - log a message to the user if the hashes match
  // TODO(tystark) - short-circuit if the hashes match and there is no --force
  // TODO(tystark) - short-circuit if the hashes match and there is no --force

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
  if (!context.config) {
    return;
  }

  if (!payload.functions) {
    return;
  }

  await checkHttpIam(context, options, payload);
  const uploads: Promise<void>[] = [];
  for (const [codebase, { wantBackend }] of Object.entries(payload.functions)) {
    uploads.push(uploadCodebase(context, codebase, wantBackend));
  }
  await Promise.all(uploads);
}
