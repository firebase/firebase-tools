import * as clc from "cli-color";
import { setGracefulCleanup } from "tmp";

import { functionsUploadRegion } from "../../api";
import * as gcp from "../../gcp";
import { logSuccess, logWarning } from "../../utils";
import { checkHttpIam } from "./checkIam";

const GCP_REGION = functionsUploadRegion;

setGracefulCleanup();

async function uploadSource(context: any): Promise<void> {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deploy(context: any, options: any, payload: any): Promise<void> {
  if (options.config.get("functions")) {
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
}
