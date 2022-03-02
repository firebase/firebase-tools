import { FirebaseError } from "../../error";
import { client } from "./client";
import { needProjectNumber } from "../../projectUtils";
import { normalizedHostingConfigs } from "../../hosting/normalizedHostingConfigs";
import { validateDeploy } from "./validate";
import { convertConfig } from "./convertConfig";
import * as deploymentTool from "../../deploymentTool";
import { cloneVersion, getLatestRelease } from "../../hosting/api";
import { logger } from "../../logger";
import { logLabeledBullet } from "../../utils";

/**
 *  Prepare creates versions for each Hosting site to be deployed.
 */
export async function prepare(context: any, options: any): Promise<void> {
  // Allow the public directory to be overridden by the --public flag
  if (options.public) {
    if (Array.isArray(options.config.get("hosting"))) {
      throw new FirebaseError("Cannot specify --public option with multi-site configuration.");
    }

    options.config.set("hosting.public", options.public);
  }

  const projectNumber = await needProjectNumber(options);

  const configs = normalizedHostingConfigs(options, { resolveTargets: true });
  if (configs.length === 0) {
    return Promise.resolve();
  }

  context.hosting = {
    deploys: configs.map((cfg) => {
      return { config: cfg, site: cfg.site };
    }),
  };

  const versionCreates: unknown[] = [];

  for (const deploy of context.hosting.deploys) {
    const cfg = deploy.config;

    validateDeploy(deploy, options);

    const data = {
      config: convertConfig(cfg),
      labels: deploymentTool.labels(),
    };

    if (cfg.immutable) {
      logLabeledBullet(
        `hosting[${deploy.site}]`,
        "cloning immutable content from current release..."
      );
      versionCreates.push(
        (async function () {
          // fetch current version from to-deploy-to channel
          const currentRelease = await getLatestRelease(deploy.site, context.hostingChannel);
          // clone it, keeping all immutable files
          const clonedVersion = await cloneVersion(deploy.site, currentRelease.version.name, {
            finalize: false,
            include: { regexes: [...cfg.immutable] },
          });
          deploy.version = clonedVersion.name;
          await client.patch(`/${deploy.version}`, data, {
            queryParams: { updateMask: "config,labels" },
          });
        })()
      );
    } else {
      versionCreates.push(
        client
          .post<{ config: unknown; labels: { [k: string]: string } }, { name: string }>(
            `/projects/${projectNumber}/sites/${deploy.site}/versions`,
            data
          )
          .then((res) => {
            deploy.version = res.body.name;
          })
      );
    }
  }

  await Promise.all(versionCreates);
}
