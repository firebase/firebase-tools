const _ = require("lodash");

/**
 * convertConfig takes a hosting config object from firebase.json and transforms it into
 * the valid format for sending to the Firebase Hosting REST API
 */
module.exports = function(config) {
  const out = {};

  if (!config) {
    return out;
  }

  // rewrites
  if (_.isArray(config.rewrites)) {
    out.rewrites = config.rewrites.map(function(rewrite) {
      const vRewrite = { glob: rewrite.source };
      if (rewrite.destination) {
        vRewrite.path = rewrite.destination;
      } else if (rewrite.function) {
        vRewrite.function = rewrite.function;
      }
      return vRewrite;
    });
  }

  // redirects
  if (_.isArray(config.redirects)) {
    out.redirects = config.redirects.map(function(redirect) {
      const vRedirect = { glob: redirect.source, location: redirect.destination };
      if (redirect.type) {
        vRedirect.statusCode = redirect.type;
      }
      return vRedirect;
    });
  }

  // headers
  if (_.isArray(config.headers)) {
    out.headers = config.headers.map(function(header) {
      const vHeader = { glob: header.source };
      vHeader.headers = {};
      (header.headers || []).forEach(function(h) {
        vHeader.headers[h.key] = h.value;
      });
      return vHeader;
    });
  }

  // cleanUrls
  if (_.has(config, "cleanUrls")) {
    out.cleanUrls = config.cleanUrls;
  }

  // trailingSlash
  if (config.trailingSlash === true) {
    out.trailingSlashBehavior = "ADD";
  } else if (config.trailingSlash === false) {
    out.trailingSlashBehavior = "REMOVE";
  }

  return out;
};
