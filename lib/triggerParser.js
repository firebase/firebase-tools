// This is an indepedently executed script that parses triggers
// from a functions package directory.
'use strict';

var extractTriggers = require('./extractTriggers');
var EXIT = function() { process.exit(0); };

(function() { // wrap in function to allow return without exiting process
  var packageDir = process.argv[2];
  if (!packageDir) {
    process.send({error: 'Must supply package directory for functions trigger parsing.'}, EXIT);
    return;
  }

  var mod;
  var triggers = [];
  try {
    mod = require(packageDir);
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      process.send({error: 'Error parsing triggers: ' + e.message + '\n\nTry running "npm install" in your functions directory before deploying.'}, EXIT);
      return;
    }

    process.send({error: 'Error occurred while parsing your function triggers.\n\n' + e.stack}, EXIT);
    return;
  }

  extractTriggers(mod, triggers);

  process.send({triggers: triggers}, EXIT);
})();
