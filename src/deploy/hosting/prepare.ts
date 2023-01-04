import { FirebaseError } from "../../error";
import * as api from "../../hosting/api";
import * as config from "../../hosting/config";
import * as deploymentTool from "../../deploymentTool";
import { Context } from "./context";
import { Options } from "../../options";
import { HostingOptions } from "../../hosting/options";
import { zipIn } from "../../functional";
import { track } from "../../track";

/**
 *  Prepare creates versions for each Hosting site to be deployed.
 */
export async function prepare(context: Context, options: HostingOptions & Options): Promise<void> {
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

  const versions = await Promise.all(
    configs.map(async (config) => {
      const labels: Record<string, string> = {
        ...deploymentTool.labels(),
      };
      if (config.webFramework) {
        labels["firebase-web-framework"] = config.webFramework;
      }
      const version: Omit<api.Version, api.VERSION_OUTPUT_FIELDS> = {
        status: "CREATED",
        labels,
      };
      const [, versionName] = await Promise.all([
        track("hosting_deploy", config.webFramework || "classic"),
        api.createVersion(config.site, version),
      ]);
      return versionName;
    })
  );
  context.hosting = {
    deploys: [],
  };
  for (const [config, version] of configs.map(zipIn(versions))) {
    context.hosting.deploys.push({ config, version });
  }
}
