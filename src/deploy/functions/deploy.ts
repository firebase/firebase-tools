import * as clc from "cli-color";
import { setGracefulCleanup } from "tmp";

import { functionsUploadRegion } from "../../api";
import { logSuccess, logWarning } from "../../utils";
import { checkHttpIam } from "./checkIam";
import * as args from "./args";
import * as gcp from "../../gcp";

const GCP_REGION = functionsUploadRegion;

setGracefulCleanup();

async function uploadSource(context: args.Context): Promise<void> {
  const uploadUrl = await gcp.cloudfunctions.generateUploadUrl(context.projectId, GCP_REGION);
  context.uploadUrl = uploadUrl;
  const apiUploadUrl = uploadUrl.replace("https://storage.googleapis.com", "");
  await gcp.storage.upload(context.functionsSource, apiUploadUrl);
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
    await uploadSource(context);
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
