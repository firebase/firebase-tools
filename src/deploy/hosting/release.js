const api = require("../../api");
const utils = require("../../utils");
const logger = require("../../logger");

module.exports = function(context, options) {
  if (!context.hosting || !context.hosting.deploys) {
    return Promise.resolve();
  }

  logger.debug(JSON.stringify(context.hosting.deploys, null, 2));
  return Promise.all(
    context.hosting.deploys.map(async function(deploy) {
      utils.logLabeledBullet("hosting[" + deploy.site + "]", "finalizing version...");
      const finalizeResult = await api.request(
        "PATCH",
        `/v1beta1/${deploy.version}?updateMask=status`,
        {
          origin: api.hostingApiOrigin,
          auth: true,
          data: { status: "FINALIZED" },
        }
      );

      logger.debug("[hosting] finalized version for " + deploy.site + ":", finalizeResult.body);
      utils.logLabeledSuccess("hosting[" + deploy.site + "]", "version finalized");
      utils.logLabeledBullet("hosting[" + deploy.site + "]", "releasing new version...");

      // TODO: We should deploy to the resource we're given rather than have to check for a channel here.
      const channelSegment =
        context.hostingChannel && context.hostingChannel !== "live"
          ? `/channels/${context.hostingChannel}`
          : "";
      if (channelSegment) {
        logger.debug("[hosting] releasing to channel:", context.hostingChannel);
      }

      const releaseResult = await api.request(
        "POST",
        `/v1beta1/sites/${deploy.site}${channelSegment}/releases?version_name=${deploy.version}`,
        {
          auth: true,
          origin: api.hostingApiOrigin,
          data: { message: options.message || null },
        }
      );
      logger.debug("[hosting] release:", releaseResult.body);
      utils.logLabeledSuccess("hosting[" + deploy.site + "]", "release complete");
    })
  );
};
