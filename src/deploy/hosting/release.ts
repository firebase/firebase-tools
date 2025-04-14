import * as api from "../../hosting/api";
import { logger } from "../../logger";
import * as utils from "../../utils";
import { convertConfig } from "./convertConfig";
import { Context } from "./context";
import { FirebaseError } from "../../error";
import { Payload as FunctionsPayload } from "../functions/args";

/**
 *  Release finalized a Hosting release.
 */
export async function release(
  context: Context,
  options: { message?: string },
  functionsPayload: FunctionsPayload,
): Promise<void> {
  if (!context.hosting || !context.hosting.deploys) {
    return;
  }

  logger.debug(JSON.stringify(context.hosting.deploys, null, 2));
  await Promise.all(
    context.hosting.deploys.map(async (deploy) => {
      if (!deploy.version) {
        throw new FirebaseError(
          "Assertion failed: Hosting version should have been set in the prepare phase",
          { exit: 2 },
        );
      }
      utils.logLabeledBullet(`hosting[${deploy.config.site}]`, "finalizing version...");

      const update: Partial<api.Version> = {
        status: "FINALIZED",
        config: await convertConfig(context, functionsPayload, deploy),
      };

      const versionId = utils.last(deploy.version.split("/"));
      const finalizedVersion = await api.updateVersion(deploy.config.site, versionId, update);

      logger.debug(`[hosting] finalized version for ${deploy.config.site}:${finalizedVersion}`);
      utils.logLabeledSuccess(`hosting[${deploy.config.site}]`, "version finalized");
      utils.logLabeledBullet(`hosting[${deploy.config.site}]`, "releasing new version...");

      if (context.hostingChannel) {
        logger.debug("[hosting] releasing to channel:", context.hostingChannel);
      }

      const otherReleaseOpts: Partial<Pick<api.Release, "message">> = {};
      if (options.message) {
        otherReleaseOpts.message = options.message;
      }
      const release = await api.createRelease(
        deploy.config.site,
        context.hostingChannel || "live",
        deploy.version,
        otherReleaseOpts,
      );
      logger.debug("[hosting] release:", release);
      utils.logLabeledSuccess(`hosting[${deploy.config.site}]`, "release complete");
    }),
  );
}
