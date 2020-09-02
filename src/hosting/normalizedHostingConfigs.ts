import { bold } from "cli-color";

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

  onlyTargets = onlyTargets
    .filter((target) => target.startsWith("hosting:"))
    .map((target) => target.replace("hosting:", ""));

  return configs.filter((config: HostingConfig) =>
    onlyTargets.includes(config.target || config.site)
  );
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
  let configs = cmdOptions.config.get("hosting");
  if (!configs) {
    return [];
  }
  if (!Array.isArray(configs)) {
    if (!configs.target && !configs.site) {
      // The default Hosting site is the same as the default RTDB instance,
      // since for projects created since mid-2016 they are both the same
      // as the project id, and for projects created before the Hosting
      // site was created along with the RTDB instance.
      configs.site = cmdOptions.instance;
    }
    configs = [configs];
  }

  configs = filterOnly(configs, cmdOptions.only);

  if (options.resolveTargets) {
    configs.forEach((cfg: HostingConfig) => {
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
    });
  }

  return configs;
}
