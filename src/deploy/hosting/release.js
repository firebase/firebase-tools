const api = require("../../api");
const utils = require("../../utils");
const logger = require("../../logger");

module.exports = function(context, options) {
  if (!context.hosting || !context.hosting.deploys) {
    return Promise.resolve();
  }

  logger.debug(JSON.stringify(context.hosting.deploys, null, 2));
  return Promise.all(
    context.hosting.deploys.map(function(deploy) {
      utils.logLabeledBullet("hosting[" + deploy.site + "]", "finalizing version...");
      return api
        .request("PATCH", "/v1beta1/" + deploy.version + "?updateMask=status", {
          origin: api.hostingApiOrigin,
          auth: true,
          data: { status: "FINALIZED" },
        })
        .then(function(result) {
          logger.debug("[hosting] finalized version for " + deploy.site + ":", result.body);
          utils.logLabeledSuccess("hosting[" + deploy.site + "]", "version finalized");
          utils.logLabeledBullet("hosting[" + deploy.site + "]", "releasing new version...");
          return api.request(
            "POST",
            "/v1beta1/sites/" + deploy.site + "/releases?version_name=" + deploy.version,
            {
              auth: true,
              origin: api.hostingApiOrigin,
              data: { message: options.message || null },
            }
          );
        })
        .then(function(result) {
          logger.debug("[hosting] release:", result.body);
          utils.logLabeledSuccess("hosting[" + deploy.site + "]", "release complete");
        });
    })
  );
};
