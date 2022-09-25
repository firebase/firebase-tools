import * as api from "../../hosting/api";
import { logger } from "../../logger";
import { needProjectNumber } from "../../projectUtils";
import * as utils from "../../utils";
import { convertConfig } from "./convertConfig";
import { Payload } from "./args";
import { Context } from "./context";
import { Options } from "../../options";

/**
 *  Release finalized a Hosting release.
 */
export async function release(context: Context, options: Options, payload: Payload): Promise<void> {
  if (!context.hosting || !context.hosting.deploys) {
    return;
  }

  const projectNumber = await needProjectNumber(options);

  logger.debug(JSON.stringify(context.hosting.deploys, null, 2));
  await Promise.all(
    context.hosting.deploys.map(async (deploy) => {
      utils.logLabeledBullet(`hosting[${deploy.site}]`, "finalizing version...");

      const finalized = await api.updateVersion(deploy.version!, {
        status: "FINALIZED",
        config: await convertConfig(context, payload, deploy, /* finalize= */ true),
      });

      logger.debug(
        `[hosting] finalized version for ${deploy.site}:${JSON.stringify(finalized, null, 2)}`
      );
      utils.logLabeledSuccess(`hosting[${deploy.site}]`, "version finalized");
      utils.logLabeledBullet(`hosting[${deploy.site}]`, "releasing new version...");

      if (context.hostingChannel) {
        logger.debug("[hosting] releasing to channel:", context.hostingChannel);
      }

      const release = await api.createRelease(
        deploy.site,
        context.hostingChannel || "live",
        deploy.version!
      );
      logger.debug("[hosting] release:", JSON.stringify(release, null, 2));
      utils.logLabeledSuccess(`hosting[${deploy.site}]`, "release complete");
    })
  );
}
