"use strict";

var _ = require("lodash");

const api = require("../../api");
const convertConfig = require("./convertConfig");
const fsutils = require("../../fsutils");
const resolveProjectPath = require("../../resolveProjectPath");
const utils = require("../../utils");
const normalizedHostingConfigs = require("../../hosting/normalizedHostingConfigs");

module.exports = function(context, options) {
  // Allow the public directory to be overridden by the --public flag
  if (options.public) {
    if (_.isArray(options.config.get("hosting"))) {
      return utils.reject("Cannot specify --public option with multi-site configuration.");
    }

    // trigger legacy key import since public may not exist in firebase.json
    options.config.importLegacyHostingKeys();
    options.config.set("hosting.public", options.public);
  }

  const configs = normalizedHostingConfigs(options);
  if (configs.length === 0) {
    return Promise.resolve();
  }

  context.hosting = {
    deploys: configs.map(function(cfg) {
      return { config: cfg };
    }),
  };

  const versionCreates = [];

  _.each(context.hosting.deploys, function(deploy) {
    let cfg = deploy.config;

    if (cfg.target) {
      const matchingTargets = options.rc.requireTarget(options.project, "hosting", cfg.target);
      if (matchingTargets.length > 1) {
        return utils.reject(
          "Hosting target " +
            clc.bold(cfg.target) +
            " is linked to multiple sites, but only one is permitted. To clear, run:\n\n  firebase target:clear hosting " +
            cfg.target
        );
      }
      deploy.site = matchingTargets[0];
    } else if (cfg.site) {
      deploy.site = cfg.site;
    } else {
      return utils.reject('Must supply either "site" or "target" in each "hosting" config.');
    }

    if (!fsutils.dirExistsSync(resolveProjectPath(options.cwd, cfg.public))) {
      return utils.reject(
        "Specified public directory '" +
          cfg.public +
          "'does not exist, can't deploy hosting to site " +
          deploy.site,
        {
          exit: 1,
        }
      );
    }

    versionCreates.push(
      api
        .request("POST", "/v1beta1/sites/" + deploy.site + "/versions", {
          origin: api.hostingApiOrigin,
          auth: true,
          data: {
            config: convertConfig(cfg),
          },
        })
        .then(function(result) {
          deploy.version = result.body.name;
        })
    );
  });

  return Promise.all(versionCreates);
};
