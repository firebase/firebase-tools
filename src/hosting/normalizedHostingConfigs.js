const _ = require("lodash");

function _filterOnly(configs, onlyString) {
  if (!onlyString) {
    return configs;
  }

  var onlyTargets = onlyString.split(",");
  // If an unqualified "hosting" is in the --only,
  // all hosting sites should be deployed.
  if (_.includes(onlyTargets, "hosting")) {
    return configs;
  }

  onlyTargets = onlyTargets
    .filter(function(anOnly) {
      return anOnly.indexOf("hosting:") === 0;
    })
    .map(function(anOnly) {
      return anOnly.replace("hosting:", "");
    });

  return configs.filter(function(config) {
    return _.includes(onlyTargets, config.target || config.site);
  });
}

module.exports = function(options) {
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
};
