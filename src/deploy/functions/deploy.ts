import { setGracefulCleanup } from "tmp";
import * as clc from "cli-color";
import * as fs from "fs";

import { checkHttpIam } from "./checkIam";
import { functionsUploadRegion } from "../../api";
import { logSuccess, logWarning } from "../../utils";
import { Options } from "../../options";
import * as args from "./args";
import * as gcs from "../../gcp/storage";
import * as gcf from "../../gcp/cloudfunctions";
import * as gcfv2 from "../../gcp/cloudfunctionsv2";
import * as utils from "../../utils";

const GCP_REGION = functionsUploadRegion;

setGracefulCleanup();

async function uploadSourceV1(context: args.Context): Promise<void> {
  const uploadUrl = await gcf.generateUploadUrl(context.projectId, GCP_REGION);
  context.uploadUrl = uploadUrl;
  const uploadOpts = {
    file: context.functionsSourceV1!,
    stream: fs.createReadStream(context.functionsSourceV1!),
  };
  await gcs.upload(uploadOpts, uploadUrl, {
    "x-goog-content-length-range": "0,104857600",
  });
}

async function uploadSourceV2(context: args.Context, region: string): Promise<void> {
  const res = await gcfv2.generateUploadUrl(context.projectId, region);
  const uploadOpts = {
    file: context.functionsSourceV2!,
    stream: fs.createReadStream(context.functionsSourceV2!),
  };
  await gcs.upload(uploadOpts, res.uploadUrl);
  context.storage = { ...context.storage, [region]: res.storageSource };
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
  if (!options.config.src.functions) {
    return;
  }

  if (!context.functionsSourceV1 && !context.functionsSourceV2) {
    return;
  }

  await checkHttpIam(context, options, payload);

  try {
    const want = payload.functions!.backend;
    const uploads: Promise<void>[] = [];
    if (want.cloudFunctions.some((fn) => fn.platform === "gcfv1")) {
      uploads.push(uploadSourceV1(context));
    }
    if (want.cloudFunctions.some((fn) => fn.platform === "gcfv2")) {
      // GCFv2 cares about data residency and will possibly block deploys coming from other
      // regions. At minimum, the implementation would consider it user-owned source and
      // would break download URLs + console source viewing.
      const functions = payload.functions!.backend.cloudFunctions;
      const regions: string[] = [];
      for (const func of functions) {
        if (func.platform === "gcfv2" && -1 === regions.indexOf(func.region)) {
          regions.push(func.region);
        }
      }
      for (const region of regions) {
        uploads.push(uploadSourceV2(context, region));
      }
    }
    await Promise.all(uploads);

    utils.assertDefined(
      options.config.src.functions.source,
      "Error: 'functions.source' is not defined"
    );
    if (uploads.length) {
      logSuccess(
        clc.green.bold("functions:") +
          " " +
          clc.bold(options.config.src.functions.source) +
          " folder uploaded successfully"
      );
    }
  } catch (err) {
    logWarning(clc.yellow("functions:") + " Upload Error: " + err.message);
    throw err;
  }
}
