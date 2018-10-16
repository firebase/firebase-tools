const BASE = "cli-firebase";

function _value() {
  if (!process.env.FIREBASE_DEPLOY_AGENT) {
    return BASE;
  }

  return [BASE, process.env.FIREBASE_DEPLOY_AGENT].join("--");
}

module.exports = {
  base: BASE,
  get value() {
    return _value();
  },
  get labels() {
    return {
      "deployment-tool": _value(),
    };
  },
  check: function(labels) {
    return labels && labels["deployment-tool"] && labels["deployment-tool"].indexOf(BASE) === 0;
  },
};
