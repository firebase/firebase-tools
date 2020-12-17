import * as clc from "cli-color";
import { setGracefulCleanup } from "tmp";

import { functionsUploadRegion } from "../../api";
import * as gcp from "../../gcp";
import { logBullet, logSuccess, logWarning } from "../../utils";
import * as prepareFunctionsUpload from "../../prepareFunctionsUpload";
import { checkHttpIam } from "./checkIam";

const GCP_REGION = functionsUploadRegion;

setGracefulCleanup();

async function uploadSource(
  context: { projectId: string; uploadUrl?: string },
  source: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<void> {
  const uploadUrl = await gcp.cloudfunctions.generateUploadUrl(context.projectId, GCP_REGION);
  context.uploadUrl = uploadUrl;
  const apiUploadUrl = uploadUrl.replace("https://storage.googleapis.com", "");
  await gcp.storage.upload(source, apiUploadUrl);
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
    logBullet(
      clc.cyan.bold("functions:") +
        " preparing " +
        clc.bold(options.config.get("functions.source")) +
        " directory for uploading..."
    );

    const source = await prepareFunctionsUpload(context, options);
    context.existingFunctions = await gcp.cloudfunctions.listAll(context.projectId);
    payload.functions = {
      triggers: options.config.get("functions.triggers"),
    };

    await checkHttpIam(context, options, payload);

    if (!source) {
      return;
    }
    try {
      await uploadSource(context, source);
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
