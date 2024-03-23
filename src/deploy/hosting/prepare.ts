import { FirebaseError } from "../../error";
import * as api from "../../hosting/api";
import * as config from "../../hosting/config";
import * as deploymentTool from "../../deploymentTool";
import * as clc from "colorette";
import { Context } from "./context";
import { Options } from "../../options";
import { HostingOptions } from "../../hosting/options";
import { assertExhaustive, zipIn } from "../../functional";
import { trackGA4 } from "../../track";
import * as utils from "../../utils";
import { HostingSource, RunRewrite } from "../../firebaseConfig";
import * as backend from "../functions/backend";
import { ensureTargeted } from "../../functions/ensureTargeted";
import { generateSSRCodebaseId } from "../../frameworks";

function handlePublicDirectoryFlag(options: HostingOptions & Options): void {
  // Allow the public directory to be overridden by the --public flag
  if (options.public) {
    if (Array.isArray(options.config.get("hosting"))) {
      throw new FirebaseError("Cannot specify --public option with multi-site configuration.");
    }

    options.config.set("hosting.public", options.public);
  }
}

/**
 * Return whether any hosting config tags any functions.
 * This is used to know whether a deploy needs to add functions to the targets,
 * ask for permissions explicitly (they may not have been asked for in the
 * normal boilerplate), and the only string might need to be updated with
 * addPinnedFunctionsToOnlyString.
 */
export function hasPinnedFunctions(options: HostingOptions & Options): boolean {
  handlePublicDirectoryFlag(options);
  for (const c of config.hostingConfig(options)) {
    for (const r of c.rewrites || []) {
      if ("function" in r && typeof r.function === "object" && r.function.pinTag) {
        return true;
      }
    }
  }
  return false;
}

/**
 * If there is a rewrite to a tagged function, add it to the deploy target.
 * precondition: we have permissions to call functions APIs.
 * TODO: we should add an optional codebase field to the rewrite so that we
 * can skip loading other functions codebases on deploy
 */
export async function addPinnedFunctionsToOnlyString(
  context: Context,
  options: HostingOptions & Options,
): Promise<boolean> {
  if (!options.only) {
    return false;
  }

  // This must be called before modifying hosting config because we turn it from
  // a scalar to an array now
  handlePublicDirectoryFlag(options);

  const addedFunctions: string[] = [];
  for (const c of config.hostingConfig(options)) {
    const addedFunctionsPerSite: string[] = [];
    for (const r of c.rewrites || []) {
      if (!("function" in r) || typeof r.function !== "object" || !r.function.pinTag) {
        continue;
      }

      const endpoint: backend.Endpoint | null = (await backend.existingBackend(context)).endpoints[
        r.function.region || "us-central1"
      ]?.[r.function.functionId];
      if (endpoint) {
        options.only = ensureTargeted(options.only, endpoint.codebase || "default", endpoint.id);
      } else if (c.webFramework) {
        options.only = ensureTargeted(
          options.only,
          generateSSRCodebaseId(c.site),
          r.function.functionId,
        );
      } else {
        // This endpoint is just being added in this push. We don't know what codebase it is.
        options.only = ensureTargeted(options.only, r.function.functionId);
      }
      addedFunctionsPerSite.push(r.function.functionId);
    }
    if (addedFunctionsPerSite.length) {
      utils.logLabeledBullet(
        "hosting",
        "The following function(s) are pinned to site " +
          `${clc.bold(c.site)} and will be deployed as well: ` +
          addedFunctionsPerSite.map(clc.bold).join(","),
      );
      addedFunctions.push(...addedFunctionsPerSite);
    }
  }
  return addedFunctions.length !== 0;
}

/**
 *  Prepare creates versions for each Hosting site to be deployed.
 */
export async function prepare(context: Context, options: HostingOptions & Options): Promise<void> {
  handlePublicDirectoryFlag(options);

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
        const msg =
          `Cannot deploy site ${clc.bold(config.site)} to channel ` +
          `${clc.bold(context.hostingChannel!)} because it would modify one or ` +
          `more rewrites in "live" that are not pinned, breaking production. ` +
          `Please pin "live" before pinning other channels.`;
        utils.logLabeledError("Hosting", msg);
        throw new Error(msg);
      }
      const runPins = config.rewrites
        ?.filter((r) => "run" in r && r.run.pinTag)
        ?.map((r) => (r as RunRewrite).run.serviceId);
      if (runPins?.length) {
        utils.logLabeledBullet(
          "hosting",
          `The site ${clc.bold(config.site)} will pin rewrites to the current ` +
            `latest revision of service(s) ${runPins.map(clc.bold).join(",")}`,
        );
      }
      const version: Omit<api.Version, api.VERSION_OUTPUT_FIELDS> = {
        status: "CREATED",
        labels,
      };
      const [, versionName] = await Promise.all([
        trackGA4("hosting_version", {
          framework: config.webFramework || "classic",
        }),
        api.createVersion(config.site, version),
      ]);
      return versionName;
    }),
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
  config: config.HostingResolved,
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
      existingUntaggedRewrites[rewriteTarget(rewrite)] =
        `${rewrite.run.region}/${rewrite.run.serviceId}`;
    }
  }

  // There is only a problem if we're targeting the same exact run service but
  // live isn't tagged.
  return Object.keys(targetTaggedRewrites).filter(
    (target) => targetTaggedRewrites[target] === existingUntaggedRewrites[target],
  );
}
