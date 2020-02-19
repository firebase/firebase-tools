import * as _ from "lodash";

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
  if (_.includes(onlyTargets, "hosting")) {
    return configs;
  }

  onlyTargets = onlyTargets
    .filter((target) => target.startsWith("hosting:"))
    .map((target) => target.replace("hosting:", ""));

  return configs.filter((config: HostingConfig) =>
    _.includes(onlyTargets, config.target || config.site)
  );
}

/**
 * Normalize options to HostingConfig array.
 * @param options the Firebase CLI options object.
 * @return normalized hosting config array.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizedHostingConfigs(options: any): HostingConfig[] {
  let configs = options.config.get("hosting");
  if (!configs) {
    return [];
  } else if (!_.isArray(configs)) {
    if (!configs.target && !configs.site) {
      // The default Hosting site is the same as the default RTDB instance,
      // since for projects created since mid-2016 they are both the same
      // as the project id, and for projects created before the Hosting
      // site was created along with the RTDB instance.
      configs.site = options.instance;
    }
    configs = [configs];
  }

  return filterOnly(configs, options.only);
}
