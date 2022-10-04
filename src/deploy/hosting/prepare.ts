import { FirebaseError } from "../../error";
import * as api from "../../hosting/api";
import * as config from "../../hosting/config";
import { convertConfig } from "./convertConfig";
import * as deploymentTool from "../../deploymentTool";
import { Payload } from "./args";
import { Context } from "./context";
import { Options } from "../../options";

/**
 *  Prepare creates versions for each Hosting site to be deployed.
 */
export async function prepare(context: Context, options: Options, payload: Payload): Promise<void> {
  // Allow the public directory to be overridden by the --public flag
  if (options.public) {
    if (Array.isArray(options.config.get("hosting"))) {
      throw new FirebaseError("Cannot specify --public option with multi-site configuration.");
    }

    options.config.set("hosting.public", options.public);
  }

  const configs = config.hostingConfig(options);
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

    const data: Omit<api.Version, api.VERSION_OUTPUT_FIELDS> = {
      status: "CREATED",
      config: await convertConfig(context, payload, cfg, false),
      labels: deploymentTool.labels(),
    };

    versionCreates.push(
      (async () => {
        // TODO: Fix this inconsistency. Site and project are ids but version
        // is a name.
        deploy.version = await api.createVersion(deploy.site, data);
      })()
    );
  }

  await Promise.all(versionCreates);
}
