const getInstanceId = require("./getInstanceId");

module.exports = function(options) {
  if (options.instance) {
    return Promise.resolve();
  }

  return getInstanceId(options).then(instance => {
    options.instance = instance;
  });
};
