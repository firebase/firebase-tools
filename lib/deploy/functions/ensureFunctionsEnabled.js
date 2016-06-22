'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var RSVP = require('rsvp');

var api = require('../../api');
var utils = require('../../utils');

var POLL_INTERVAL = 10000; // 10 seconds

var _checkEnabled = function(projectId) {
  return api.request('GET', '/v1/services/cloudfunctions/projectSettings/' + projectId + '?view=CONSUMER_VIEW', {
    auth: true,
    origin: 'https://servicemanagement.googleapis.com'
  }).then(function(response) {
    var isEnabled = _.get(response.body, 'usageSettings.consumerEnableStatus') === 'ENABLED';
    if (isEnabled) {
      utils.logSuccess(chalk.bold.green('functions:') + ' all necessary APIs are enabled');
    }
    return isEnabled;
  });
};

var _enableFunctionsApi = function(projectId) {
  return api.request('PATCH', '/v1/services/cloudfunctions/projectSettings/' + projectId + '?updateMask=usageSettings', {
    auth: true,
    data: {
      usageSettings: {consumerEnableStatus: 'ENABLED'}
    },
    origin: 'https://servicemanagement.googleapis.com'
  });
};

var _pollCheckEnabled = function(projectId, retries) {
  retries = retries || 0;
  // abandon after 30 retries (5 minutes)
  if (retries > 30) {
    return utils.reject('Timed out waiting for Functions APIs to enable. Please try again in a few minutes.');
  }

  return new RSVP.Promise(function(resolve) {
    setTimeout(function() { resolve(); }, POLL_INTERVAL);
  }).then(function() {
    return _checkEnabled(projectId).then(function(isEnabled) {
      if (isEnabled) {
        return true;
      }
      utils.logBullet(chalk.bold.cyan('functions:') + ' waiting for APIs to activate...');
      return _pollCheckEnabled(projectId, retries + 1);
    });
  });
};

module.exports = function(projectId) {
  utils.logBullet(chalk.bold.cyan('functions:') + ' ensuring necessary Functions APIs are enabled...');
  return _checkEnabled(projectId).then(function(isEnabled) {
    if (isEnabled) {
      return true;
    }

    utils.logWarning(chalk.bold.yellow('functions:') + ' missing necessary APIs. Enabling now...');
    return _enableFunctionsApi(projectId).then(function() {
      return _pollCheckEnabled(projectId);
    });
  });
};
