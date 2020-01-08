import * as _ from "lodash";

type HostingConfig = { site: string; target: string };

/**
 * @param configs
 * @param onlyString
 * @return {HostingConfig[]}
 */
function _filterOnly(configs: HostingConfig[], onlyString: string): HostingConfig[] {
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
    .filter((anOnly) => anOnly.startsWith("hosting:"))
    .map((anOnly) => anOnly.replace("hosting:", ""));

  return configs.filter((config: HostingConfig) =>
    _.includes(onlyTargets, config.target || config.site)
  );
}

/**
 * @param options
 * @return {any[] | HostingConfig[]}
 */
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

  return _filterOnly(configs, options.only);
}
