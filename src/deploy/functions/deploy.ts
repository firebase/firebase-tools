import * as clc from "cli-color";
import { setGracefulCleanup } from "tmp";

import { checkHttpIam } from "./checkIam";
import { functionsUploadRegion } from "../../api";
import { logSuccess, logWarning } from "../../utils";
import * as args from "./args";
import * as backend from "./backend";
import * as fs from "fs";
import * as gcs from "../../gcp/storage";
import * as gcf from "../../gcp/cloudfunctions";

const GCP_REGION = functionsUploadRegion;

setGracefulCleanup();

async function uploadSourceV1(context: args.Context): Promise<void> {
  const uploadUrl = await gcf.generateUploadUrl(context.projectId, GCP_REGION);
  context.uploadUrl = uploadUrl;
  const uploadOpts = {
    file: context.functionsSource!,
    stream: fs.createReadStream(context.functionsSource!),
  };
  await gcs.upload(uploadOpts, uploadUrl);
}

async function uploadSourceV2(context: args.Context): Promise<void> {
  const bucket = "staging." + (await gcs.getDefaultBucket(context.projectId));
  const uploadOpts = {
    file: context.functionsSource!,
    stream: fs.createReadStream(context.functionsSource!),
  };
  context.storageSource = await gcs.uploadObject(uploadOpts, bucket);
}

/**
 * The "deploy" stage for Cloud Functions -- uploads source code to a generated URL.
 * @param context The deploy context.
 * @param options The command-wide options object.
 * @param payload The deploy payload.
 */
export async function deploy(
  context: args.Context,
  options: args.Options,
  payload: args.Payload
): Promise<void> {
  if (!options.config.get("functions")) {
    return;
  }

  await checkHttpIam(context, options, payload);

  if (!context.functionsSource) {
    return;
  }

  try {
    const want = options.config.get("functions.backend") as backend.Backend;
    const uploads: Promise<void>[] = [];
    if (want.cloudFunctions.some((fn) => fn.apiVersion === 1)) {
      uploads.push(uploadSourceV1(context));
    }
    if (want.cloudFunctions.some((fn) => fn.apiVersion === 2)) {
      uploads.push(uploadSourceV2(context));
    }
    await Promise.all(uploads);

    logSuccess(
      clc.green.bold("functions:") +
        " " +
        clc.bold(options.config.get("functions.source")) +
        " folder uploaded successfully"
    );
  } catch (err) {
    logWarning(clc.yellow("functions:") + " Upload Error: " + err.message);
    throw err;
  }
}
