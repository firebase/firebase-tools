const api = require("../../api");
const utils = require("../../utils");
const logger = require("../../logger");

module.exports = function(context, options) {
  if (!context.hosting || !context.hosting.version) {
    return Promise.resolve();
  }

  utils.logLabeledBullet("hosting", "finalizing version...");
  return api
    .request("PATCH", "/v1beta1/" + context.hosting.version + "?updateMask=status", {
      origin: api.hostingApiOrigin,
      auth: true,
      data: { status: "FINALIZED" },
    })
    .then(function(result) {
      logger.debug("[hosting] finalized version:", result.body);
      utils.logLabeledSuccess("hosting", "version finalized");
      utils.logLabeledBullet("hosting", "releasing new version...");
      return api.request(
        "POST",
        "/v1beta1/sites/" + options.instance + "/releases?version_name=" + context.hosting.version,
        {
          auth: true,
          origin: api.hostingApiOrigin,
          data: { message: options.message || null },
        }
      );
    })
    .then(function(result) {
      logger.debug("[hosting] release:", result.body);
      utils.logLabeledSuccess("hosting", "release complete");
    });
};
