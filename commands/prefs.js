'use strict';

var Command = require('../lib/command');
var logger = require('../lib/logger');
var configstore = require('../lib/configstore');
var requireAuth = require('../lib/requireAuth');

module.exports = new Command('prefs')
  .description('print all of your currently stored local configuration')
  .before(requireAuth)
  .action(function() {
    logger.info(configstore.all);
    return configstore.all;
  });
