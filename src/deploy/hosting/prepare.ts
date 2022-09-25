import { FirebaseError } from "../../error";
import * as api from "../../hosting/api";
import { needProjectNumber } from "../../projectUtils";
import * as config from "../../hosting/config";
import * as deploymentTool from "../../deploymentTool";
import { Payload } from "./args";
import { Options } from "../../options";
import { Context } from "./context";
import { convertConfig } from "./convertConfig";

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

  const projectNumber = await needProjectNumber(options);

  const configs = config.hostingConfig(options);
  if (configs.length === 0) {
    return Promise.resolve();
  }

  context.hosting = {
    deploys: configs.map((config) => {
      // null assertion is safe becasue hostingConfig resolves the default site
      // in case of a hosting single and resolves targets into sites
      return { config, site: config.site! };
    }),
  };

  // TODO: type Context so that we don't have type errors
  await Promise.all(
    context.hosting.deploys.map(async (deploy) => {
      const version: Omit<api.Version, api.VERSION_OUTPUT_FIELDS> = {
        config: await convertConfig(context, payload, deploy, false),
        labels: deploymentTool.labels(),
      };
      deploy.version = await api.createVersion(projectNumber, deploy.site, version);
    })
  );
}
