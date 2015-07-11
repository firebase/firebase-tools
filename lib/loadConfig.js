var fs = require('fs');
var path = require('path');
var FirebaseError = require('./error');

var CONFIG_FILENAME = 'firebase.json';

module.exports = function(cwd) {
  /* istanbul ignore next */
  cwd = cwd || process.cwd();
  var configPath = path.join(cwd, CONFIG_FILENAME);

  if (fs.existsSync(configPath)) {
    return require(configPath);
  } else {
    throw new FirebaseError("Could not find " + CONFIG_FILENAME + " in the current working directory", {status: 404});
  }
}
