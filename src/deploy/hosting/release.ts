import * as api from "../../hosting/api";
import { logger } from "../../logger";
import * as utils from "../../utils";
import { convertConfig } from "./convertConfig";
import { Payload } from "./args";
import { Context } from "./context";
import { Options } from "../../options";
import { FirebaseError } from "../../error";

/**
 *  Release finalized a Hosting release.
 */
export async function release(context: Context, options: Options, payload: Payload): Promise<void> {
  if (!context.hosting || !context.hosting.deploys) {
    return;
  }

  logger.debug(JSON.stringify(context.hosting.deploys, null, 2));
  await Promise.all(
    context.hosting.deploys.map(async (deploy) => {
      if (!deploy.version) {
        throw new FirebaseError(
          "Assertion failed: Hosting version should have been set in the prepare phase",
          { exit: 2 }
        );
      }
      utils.logLabeledBullet(`hosting[${deploy.site}]`, "finalizing version...");

      const update: Partial<api.Version> = {
        status: "FINALIZED",
        config: await convertConfig(context, payload, deploy.config, /* finalize= */ true),
      };

      const parts = deploy.version.split("/");
      const versionId = parts[parts.length - 1];
      const finalizedVersion = await api.updateVersion(deploy.site, versionId, update);

      logger.debug(`[hosting] finalized version for ${deploy.site}:${finalizedVersion}`);
      utils.logLabeledSuccess(`hosting[${deploy.site}]`, "version finalized");
      utils.logLabeledBullet(`hosting[${deploy.site}]`, "releasing new version...");

      if (context.hostingChannel) {
        logger.debug("[hosting] releasing to channel:", context.hostingChannel);
      }

      const release = await api.createRelease(
        deploy.site,
        context.hostingChannel || "live",
        deploy.version
      );
      logger.debug("[hosting] release:", release);
      utils.logLabeledSuccess(`hosting[${deploy.site}]`, "release complete");
    })
  );
}
