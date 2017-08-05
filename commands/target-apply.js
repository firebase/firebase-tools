'use strict';

var Command = require('../lib/command');

module.exports = new Command('target:apply <type> <name> <resources...>')
  .description('apply a deploy target to a resource')
  .action(function(type, name, resources) {
    console.log(type, name, resources);
  });
