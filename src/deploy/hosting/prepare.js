"use strict";

const _ = require("lodash");

const api = require("../../api");
const convertConfig = require("./convertConfig");
const deploymentTool = require("../../deploymentTool");
const { FirebaseError } = require("../../error");
const fsutils = require("../../fsutils");
const { normalizedHostingConfigs } = require("../../hosting/normalizedHostingConfigs");
const { resolveProjectPath } = require("../../projectPath");

module.exports = function(context, options) {
  // Allow the public directory to be overridden by the --public flag
  if (options.public) {
    if (_.isArray(options.config.get("hosting"))) {
      throw new FirebaseError("Cannot specify --public option with multi-site configuration.");
    }

    options.config.set("hosting.public", options.public);
  }

  const configs = normalizedHostingConfigs(options, { resolveTargets: true });
  if (configs.length === 0) {
    return Promise.resolve();
  }

  context.hosting = {
    deploys: configs.map(function(cfg) {
      return { config: cfg, site: cfg.site };
    }),
  };

  const versionCreates = [];

  _.each(context.hosting.deploys, function(deploy) {
    const cfg = deploy.config;

    if (!cfg.public) {
      throw new FirebaseError(
        'Must supply a public directory using "public" in each "hosting" config.'
      );
    }

    if (!fsutils.dirExistsSync(resolveProjectPath(options, cfg.public))) {
      throw new FirebaseError(
        `Specified public directory '${cfg.public}' does not exist, ` +
          `can't deploy hosting to site ${deploy.site}`,
        { exit: 1 }
      );
    }

    const data = {
      config: convertConfig(cfg),
      labels: deploymentTool.labels,
    };

    versionCreates.push(
      api
        .request("POST", `/v1beta1/sites/${deploy.site}/versions`, {
          origin: api.hostingApiOrigin,
          auth: true,
          data,
        })
        .then(function(result) {
          deploy.version = result.body.name;
        })
    );
  });

  return Promise.all(versionCreates);
};
