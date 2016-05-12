// This is an indepedently executed script that parses triggers
// from a functions package directory.
'use strict';

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
    process.send({error: 'Error occurred while parsing your function triggers.\n\n' + e.name + ': ' + e.message});
  }
  process.exit(0);
}

for (var name in mod) {
  if (mod.hasOwnProperty(name)) {
    var fn = mod[name];
    if (fn.__trigger && typeof fn.__trigger === 'object') {
      var trigger = {};
      for (var key in fn.__trigger) {
        if (fn.__trigger.hasOwnProperty(key)) {
          trigger[key] = fn.__trigger[key];
        }
      }
      trigger.name = name;
      triggers.push(trigger);
    }
  }
}

process.send({triggers: triggers});
process.exit(0);
