"use strict";

var _ = require("lodash");
var clc = require("cli-color");

var api = require("./api");
var utils = require("./utils");

var POLL_INTERVAL = 10000; // 10 seconds
var POLLS_BEFORE_RETRY = 12; // Retry enabling the API after 2 minutes
var _enableApiWithRetries;

var _checkEnabled = function(projectId, apiName, prefix, silent) {
  return api
    .request("GET", `/v1/projects/${projectId}/services/${apiName}`, {
      auth: true,
      origin: api.serviceUsageOrigin,
    })
    .then(function(response) {
      var isEnabled = _.get(response.body, "state") === "ENABLED";
      if (isEnabled && !silent) {
        utils.logSuccess(clc.bold.green(prefix + ":") + " all necessary APIs are enabled");
      }
      return isEnabled;
    });
};

var _enableApi = function(projectId, apiName) {
  return api.request("POST", `/v1/projects/${projectId}/services/${apiName}:enable`, {
    auth: true,
    origin: api.serviceUsageOrigin,
  });
};

var _pollCheckEnabled = function(projectId, apiName, prefix, enablementRetries, pollRetries) {
  pollRetries = pollRetries || 0;
  if (pollRetries > POLLS_BEFORE_RETRY) {
    return _enableApiWithRetries(projectId, apiName, prefix, enablementRetries + 1);
  }

  return new Promise(function(resolve) {
    setTimeout(function() {
      resolve();
    }, POLL_INTERVAL);
  }).then(function() {
    return _checkEnabled(projectId, apiName, prefix).then(function(isEnabled) {
      if (isEnabled) {
        return true;
      }
      utils.logBullet(clc.bold.cyan(prefix + ":") + " waiting for APIs to activate...");
      return _pollCheckEnabled(projectId, apiName, prefix, enablementRetries, pollRetries + 1);
    });
  });
};

_enableApiWithRetries = function(projectId, apiName, prefix, enablementRetries) {
  enablementRetries = enablementRetries || 0;
  if (enablementRetries > 1) {
    return utils.reject("Timed out waiting for APIs to enable. Please try again in a few minutes.");
  }
  return _enableApi(projectId, apiName, prefix, enablementRetries).then(function() {
    return _pollCheckEnabled(projectId, apiName, prefix, enablementRetries);
  });
};

var _ensureApi = function(projectId, apiName, prefix, silent) {
  if (!silent) {
    utils.logBullet(clc.bold.cyan(prefix + ":") + " ensuring necessary APIs are enabled...");
  }
  return _checkEnabled(projectId, apiName, prefix, silent).then(function(isEnabled) {
    if (isEnabled) {
      return true;
    }

    if (!silent) {
      utils.logWarning(clc.bold.yellow(prefix + ":") + " missing necessary APIs. Enabling now...");
    }
    return _enableApiWithRetries(projectId, apiName, prefix);
  });
};

module.exports = {
  ensure: _ensureApi,
  check: _checkEnabled,
  enable: _enableApi,
};
