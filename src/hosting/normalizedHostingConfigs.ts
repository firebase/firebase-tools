import { bold } from "cli-color";
import { cloneDeep } from "lodash";

import { FirebaseError } from "../error";

interface HostingConfig {
  site: string;
  target: string;
}

function filterOnly(configs: HostingConfig[], onlyString: string): HostingConfig[] {
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

  const configsBySite = new Map<string, HostingConfig>();
  const configsByTarget = new Map<string, HostingConfig>();
  for (const c of configs) {
    if (c.site) {
      configsBySite.set(c.site, c);
    }
    if (c.target) {
      configsByTarget.set(c.target, c);
    }
  }

  const filteredConfigs: HostingConfig[] = [];
  // Check to see that all the hosting deploy targets exist in the hosting
  // config as either `site`s or `target`s.
  for (const onlyTarget of onlyTargets) {
    if (configsBySite.has(onlyTarget)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      filteredConfigs.push(configsBySite.get(onlyTarget)!);
    } else if (configsByTarget.has(onlyTarget)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      filteredConfigs.push(configsByTarget.get(onlyTarget)!);
    } else {
      throw new FirebaseError(
        `Hosting site or target ${bold(onlyTarget)} not detected in firebase.json`
      );
    }
  }

  return filteredConfigs;
}

function filterExcept(configs: HostingConfig[], exceptOption: string): HostingConfig[] {
  if (!exceptOption) {
    return configs;
  }

  const exceptTargets = exceptOption.split(",");
  if (exceptTargets.includes("hosting")) {
    return [];
  }

  const exceptValues = new Set(
    exceptTargets.filter((t) => t.startsWith("hosting:")).map((t) => t.replace("hosting:", ""))
  );

  const filteredConfigs: HostingConfig[] = [];
  for (const c of configs) {
    if (!(exceptValues.has(c.site) || exceptValues.has(c.target))) {
      filteredConfigs.push(c);
    }
  }

  return filteredConfigs;
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
  let configs = cloneDeep(cmdOptions.config.get("hosting"));
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

  for (const c of configs) {
    if (c.target && c.site) {
      throw new FirebaseError(
        `Hosting configs should only include either "site" or "target", not both.`
      );
    }
  }

  // filter* functions check if the strings are empty for us.
  let hostingConfigs: HostingConfig[] = filterOnly(configs, cmdOptions.only);
  hostingConfigs = filterExcept(hostingConfigs, cmdOptions.except);

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
