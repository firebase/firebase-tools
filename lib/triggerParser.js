// This is an indepedently executed script that parses triggers
// from a functions package directory.
'use strict';

var extractTriggers = require('./extractTriggers');

var packageDir = process.argv[2];
if (!packageDir) {
  process.send({error: 'Must supply package directory for functions trigger parsing.'});
  process.exit(0);
}

var mod;
var triggers = [];
try {
  mod = require(packageDir);
} catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') {
    process.send({error: 'Error parsing triggers: ' + e.message + '\n\nTry running "npm install" in your functions directory before deploying.'});
  } else {
    process.send({error: 'Error occurred while parsing your function triggers.\n\n' + e.stack});
  }
  process.exit(0);
}

extractTriggers(mod, triggers);

process.send({triggers: triggers});
process.exit(0);
