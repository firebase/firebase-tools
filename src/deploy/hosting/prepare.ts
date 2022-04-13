import { FirebaseError } from "../../error";
import { client } from "./client";
import { needProjectNumber } from "../../projectUtils";
import { normalizedHostingConfigs } from "../../hosting/normalizedHostingConfigs";
import { validateDeploy } from "./validate";
import { convertConfig } from "./convertConfig";
import * as deploymentTool from "../../deploymentTool";
import { Payload } from "./args";
import { allEndpoints } from "../functions/backend";

/**
 *  Prepare creates versions for each Hosting site to be deployed.
 */
export async function prepare(context: any, options: any, payload: Payload): Promise<void> {
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
      config: await convertConfig(context, payload, cfg, false),
      labels: deploymentTool.labels(),
    };

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

  await Promise.all(versionCreates);
}
