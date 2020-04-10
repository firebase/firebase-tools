"use strict";

import * as _ from "lodash";
import * as clc from "cli-color";

import * as api from "../../api";
import * as convertConfig from "./convertConfig";
import * as deploymentTool from "../../deploymentTool";
import { FirebaseError } from "../../error";
import * as fsutils from "../../fsutils";
import { normalizedHostingConfigs } from "../../hosting/normalizedHostingConfigs";
import { resolveProjectPath } from "../../projectPath";
import { checkFunctionRewrites } from "./checkFunctionRewrites";
import { logLabeledWarning } from "../../utils";
import * as logger from "../../logger";

export async function prepare(context: any, options: any): Promise<void> {
  // Allow the public directory to be overridden by the --public flag
  if (options.public) {
    if (_.isArray(options.config.get("hosting"))) {
      throw new FirebaseError("Cannot specify --public option with multi-site configuration.");
    }

    options.config.set("hosting.public", options.public);
  }

  const configs = normalizedHostingConfigs(options);
  if (configs.length === 0) {
    return;
  }

  context.hosting = {
    deploys: configs.map(function(cfg) {
      return { config: cfg };
    }),
  };

  const functionRewrites: string[] = [];
  const versionCreates: Promise<void>[] = [];

  _.each(context.hosting.deploys, function(deploy) {
    let cfg = deploy.config;

    if (cfg.target) {
      const matchingTargets = options.rc.requireTarget(options.project, "hosting", cfg.target);
      if (matchingTargets.length > 1) {
        throw new FirebaseError(
          `Hosting target ${clc.bold(cfg.target)} is linked to multiple sites, ` +
            `but only one is permitted. ` +
            `To clear, run:\n\n  firebase target:clear hosting ${cfg.target}`
        );
      }
      deploy.site = matchingTargets[0];
    } else if (cfg.site) {
      deploy.site = cfg.site;
    } else {
      throw new FirebaseError('Must supply either "site" or "target" in each "hosting" config.');
    }

    if (!cfg.public) {
      throw new FirebaseError(
        'Must supply a public directory using "public" in each "hosting" config.'
      );
    }

    if (!fsutils.dirExistsSync(resolveProjectPath(options.cwd, cfg.public))) {
      throw new FirebaseError(
        `Specified public directory '${cfg.public}' does not exist, ` +
          `can't deploy hosting to site ${deploy.site}`,
        { exit: 1 }
      );
    }

    if (_.isArray(cfg.rewrites)) {
      cfg.rewrites.forEach((rewrite: { function?: string }) => {
        if (rewrite.function && !functionRewrites.includes(rewrite.function)) {
          functionRewrites.push(rewrite.function);
        }
      });
    }

    versionCreates.push(
      api
        .request("POST", "/v1beta1/sites/" + deploy.site + "/versions", {
          origin: api.hostingApiOrigin,
          auth: true,
          data: {
            config: convertConfig(cfg),
            labels: deploymentTool.labels,
          },
        })
        .then(function(result) {
          deploy.version = result.body.name;
        })
    );
  });

  if (functionRewrites.length > 0) {
    const functionCheckResult = await checkFunctionRewrites(options.project, functionRewrites);
    if (!functionCheckResult.passed) {
      logLabeledWarning(
        "hosting",
        `Found rewrites to functions not found in location ${clc.bold(
          "us-central1"
        )} for project ${clc.bold(
          options.project
        )}. Missing functions:\n     - ${functionCheckResult.missing.join("\n     - ")}`
      );
      logLabeledWarning(
        "hosting",
        `Only HTTPS functions in ${clc.bold("us-central1")} can be rewritten by Firebase Hosting.`
      );
    }
  }

  await Promise.all(versionCreates);
}
