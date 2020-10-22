import { bold } from "cli-color";

import { FirebaseError } from "../error";
import logger = require("../logger");

interface HostingConfig {
  site: string;
  target: string;
}

function filterOnly(
  configs: HostingConfig[],
  onlyString: string,
  defaultSite: string
): HostingConfig[] {
  if (!onlyString) {
    return configs;
  }

  let onlyTargets = onlyString.split(",");
  // If an unqualified "hosting" is in the --only,
  // all hosting sites should be deployed.
  if (onlyTargets.includes("hosting")) {
    return configs;
  }

  // Strip out Hosting deploy targets from onlyTarget
  onlyTargets = onlyTargets
    .filter((target) => target.startsWith("hosting:"))
    .map((target) => target.replace("hosting:", ""));

  // There is a case where users have not set any targets but use --only to
  // specify the site name. This was working before because we weren't checking
  // the validity of the target name before doing the final filter below. Since
  // the case exists where a single (non-array, non-multi-site) config will
  // have `config.site` set, we are going to short circuit the validity check
  // of the targets to ensure the site name can be specified in a non-multi-
  // site setup.
  const configsHaveTargets = configs.some((c) => c.target);
  const onlyDefaultSite = onlyTargets.length === 1 && onlyTargets[0] === defaultSite;
  if (!configsHaveTargets && onlyDefaultSite) {
    logger.debug("filtering configs down to default site");
    return configs.filter((c) => c.site === defaultSite);
  }

  // Check to see that all the hosting deploy targets exist in the hosting config
  for (const onlyTarget of onlyTargets) {
    if (!configs.some((config) => config.target === onlyTarget)) {
      throw new FirebaseError(`Hosting target ${bold(onlyTarget)} not detected in firebase.json`);
    }
  }

  const filtered = configs.filter((config) => onlyTargets.includes(config.target));
  return filtered;
}

/**
 * Normalize options to HostingConfig array.
 * @param cmdOptions the Firebase CLI options object.
 * @param options options for normalizing configs.
 * @return normalized hosting config array.
 */
export function normalizedHostingConfigs(
  cmdOptions: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  options: { resolveTargets?: boolean } = {}
): HostingConfig[] {
  let hostingConfigs: HostingConfig[] = [];
  let configs = cmdOptions.config.get("hosting");
  if (!configs) {
    return [];
  }
  if (!Array.isArray(configs)) {
    if (!configs.target && !configs.site) {
      // earlier the default RTDB instance was used as the hosting site
      // because it used to be created along with the Firebase project.
      // RTDB instance creation is now deferred and decoupled from project creation.
      // the fallback hosting site is now filled in through requireHostingSite.
      configs.site = cmdOptions.site;
    }
    configs = [configs];
  }

  hostingConfigs = filterOnly(configs, cmdOptions.only, cmdOptions.site);

  if (options.resolveTargets) {
    for (const cfg of hostingConfigs) {
      if (cfg.target) {
        const matchingTargets = cmdOptions.rc.requireTarget(
          cmdOptions.project,
          "hosting",
          cfg.target
        );
        if (matchingTargets.length > 1) {
          throw new FirebaseError(
            `Hosting target ${bold(cfg.target)} is linked to multiple sites, ` +
              `but only one is permitted. ` +
              `To clear, run:\n\n  firebase target:clear hosting ${cfg.target}`
          );
        }
        cfg.site = matchingTargets[0];
      } else if (!cfg.site) {
        throw new FirebaseError('Must supply either "site" or "target" in each "hosting" config.');
      }
    }
  }

  return hostingConfigs;
}
