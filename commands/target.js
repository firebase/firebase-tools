'use strict';

var Command = require('../lib/command');

module.exports = new Command('target')
  .description('display configured deploy targets for the current project')
  .action(function() {
    console.log('target');
  });
