import { setGracefulCleanup } from "tmp";
import * as clc from "cli-color";
import * as fs from "fs";

import { checkHttpIam } from "./checkIam";
import { logSuccess, logWarning } from "../../utils";
import { Options } from "../../options";
import * as args from "./args";
import * as gcs from "../../gcp/storage";
import * as gcf from "../../gcp/cloudfunctions";
import * as gcfv2 from "../../gcp/cloudfunctionsv2";
import * as utils from "../../utils";
import * as backend from "./backend";

setGracefulCleanup();

async function uploadSourceV1(context: args.Context, region: string): Promise<void> {
  const uploadUrl = await gcf.generateUploadUrl(context.projectId, region);
  context.sourceUrl = uploadUrl;
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

    const v1Endpoints = backend.allEndpoints(want).filter((e) => e.platform === "gcfv1");
    if (v1Endpoints.length > 0) {
      // Choose one of the function region for source upload.
      uploads.push(uploadSourceV1(context, v1Endpoints[0].region));
    }

    for (const region of Object.keys(want.endpoints)) {
      // GCFv2 cares about data residency and will possibly block deploys coming from other
      // regions. At minimum, the implementation would consider it user-owned source and
      // would break download URLs + console source viewing.
      if (backend.regionalEndpoints(want, region).some((e) => e.platform === "gcfv2")) {
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
  } catch (err: any) {
    logWarning(clc.yellow("functions:") + " Upload Error: " + err.message);
    throw err;
  }
}
