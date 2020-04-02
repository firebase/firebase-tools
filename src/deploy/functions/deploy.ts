import * as clc from "cli-color";
import { setGracefulCleanup } from "tmp";

import * as gcp from "../../gcp";
import { logBullet, logSuccess, logWarning } from "../../utils";
import * as prepareFunctionsUpload from "../../prepareFunctionsUpload";

const GCP_REGION = gcp.cloudfunctions.DEFAULT_REGION;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
module.exports = async function(context: any, options: any, payload: any): Promise<void> {
  if (options.config.get("functions")) {
    logBullet(
      clc.cyan.bold("functions:") +
        " preparing " +
        clc.bold(options.config.get("functions.source")) +
        " directory for uploading..."
    );

    const source = await prepareFunctionsUpload(context, options);
    payload.functions = {
      triggers: options.config.get("functions.triggers"),
    };

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
};
