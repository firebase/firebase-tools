import { FirebaseError } from "../../error";
import * as api from "../../hosting/api";
import * as config from "../../hosting/config";
import * as deploymentTool from "../../deploymentTool";
import { Context } from "./context";
import { Options } from "../../options";
import { HostingOptions } from "../../hosting/options";
import { assertExhaustive, zipIn } from "../../functional";
import { track } from "../../track";
import * as utils from "../../utils";
import { HostingSource } from "../../firebaseConfig";
import * as backend from "../functions/backend";

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
      const unsafe = await unsafePins(context, config);
      if (unsafe.length) {
        const msg = `Cannot deploy site ${config.site} to channel ${context.hostingChannel} because it would modify one or more rewrites in "live" that are not pinned, breaking production. Please pin "live" before pinning other channels.`;
        utils.logLabeledError("Hosting", msg);
        throw new Error(msg);
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

function rewriteTarget(source: HostingSource): string {
  if ("glob" in source) {
    return source.glob;
  } else if ("source" in source) {
    return source.source;
  } else if ("regex" in source) {
    return source.regex;
  } else {
    assertExhaustive(source);
  }
}

/**
 * Returns a list of rewrite targets that would break in prod if deployed.
 * People use tag pinning so that they can deploy to preview channels without
 * modifying production. This assumption is violated if the live channel isn't
 * actually pinned. This method returns "unsafe" pins, where we're deploying to
 * a non-live channel with a rewrite that is pinned but haven't yet pinned live.
 */
export async function unsafePins(
  context: Context,
  config: config.HostingResolved
): Promise<string[]> {
  // Overwriting prod won't break prod
  if ((context.hostingChannel || "live") === "live") {
    return [];
  }

  const targetTaggedRewrites: Record<string, string> = {};
  for (const rewrite of config.rewrites || []) {
    const target = rewriteTarget(rewrite);
    if ("run" in rewrite && rewrite.run.pinTag) {
      targetTaggedRewrites[target] = `${rewrite.run.region || "us-central1"}/${
        rewrite.run.serviceId
      }`;
    }
    if ("function" in rewrite && typeof rewrite.function === "object" && rewrite.function.pinTag) {
      const region = rewrite.function.region || "us-central1";
      const endpoint = (await backend.existingBackend(context)).endpoints[region]?.[
        rewrite.function.functionId
      ];
      // This function is new. It can't be pinned elsewhere
      if (!endpoint) {
        continue;
      }
      targetTaggedRewrites[target] = `${region}/${endpoint.runServiceId || endpoint.id}`;
    }
  }

  if (!Object.keys(targetTaggedRewrites).length) {
    return [];
  }

  const channelConfig = await api.getChannel(context.projectId, config.site, "live");
  const existingUntaggedRewrites: Record<string, string> = {};
  for (const rewrite of channelConfig?.release?.version?.config?.rewrites || []) {
    if ("run" in rewrite && !rewrite.run.tag) {
      existingUntaggedRewrites[
        rewriteTarget(rewrite)
      ] = `${rewrite.run.region}/${rewrite.run.serviceId}`;
    }
  }

  // There is only a problem if we're targeting the same exact run service but
  // live isn't tagged.
  return Object.keys(targetTaggedRewrites).filter(
    (target) => targetTaggedRewrites[target] === existingUntaggedRewrites[target]
  );
}
