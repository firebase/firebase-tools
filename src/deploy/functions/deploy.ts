import { setGracefulCleanup } from "tmp";
import * as clc from "cli-color";
import * as fs from "fs";

import { checkHttpIam } from "./checkIam";
import { logSuccess, logWarning, groupBy, endpoint } from "../../utils";
import { Options } from "../../options";
import * as args from "./args";
import * as gcs from "../../gcp/storage";
import * as gcf from "../../gcp/cloudfunctions";
import * as gcfv2 from "../../gcp/cloudfunctionsv2";
import * as backend from "./backend";

setGracefulCleanup();

async function uploadSourceV1(context: args.Context, region: string): Promise<void> {
  const uploadUrl = await gcf.generateUploadUrl(context.projectId, region);
  context.source!.sourceUrl = uploadUrl;
  const uploadOpts = {
    file: context.source!.functionsSourceV1!,
    stream: fs.createReadStream(context.source!.functionsSourceV1!),
  };
  await gcs.upload(uploadOpts, uploadUrl, {
    "x-goog-content-length-range": "0,104857600",
  });
}

async function uploadSourceV2(context: args.Context, region: string): Promise<void> {
  const res = await gcfv2.generateUploadUrl(context.projectId, region);
  const uploadOpts = {
    file: context.source!.functionsSourceV2!,
    stream: fs.createReadStream(context.source!.functionsSourceV2!),
  };
  await gcs.upload(uploadOpts, res.uploadUrl);
  context.source!.storage = res.storageSource;
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

  if (!context.source?.functionsSourceV1 && !context.source?.functionsSourceV2) {
    return;
  }

  await checkHttpIam(context, options, payload);

  try {
    const want = payload.functions!.wantBackend;
    const uploads: Promise<void>[] = [];

    // Choose one of the function region for source upload.
    const byPlatform = groupBy(backend.allEndpoints(want), (e) => e.platform);
    if (byPlatform.gcfv1?.length > 0) {
      uploads.push(uploadSourceV1(context, byPlatform.gcfv1[0].region));
    }
    if (byPlatform.gcfv2?.length > 0) {
      uploads.push(uploadSourceV2(context, byPlatform.gcfv2[0].region));
    }
    await Promise.all(uploads);

    const source = context.config.source;
    if (uploads.length) {
      logSuccess(
        `${clc.green.bold("functions:")} ${clc.bold(source)} folder uploaded successfully`
      );
    }
  } catch (err: any) {
    logWarning(clc.yellow("functions:") + " Upload Error: " + err.message);
    throw err;
  }
}
