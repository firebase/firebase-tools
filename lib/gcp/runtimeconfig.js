"use strict";

var api = require("../api");

var utils = require("../utils");
var logger = require("../logger");
var _ = require("lodash");

var API_VERSION = "v1beta1";

function _listConfigs(projectId) {
  return api
    .request("GET", utils.endpoint([API_VERSION, "projects", projectId, "configs"]), {
      auth: true,
      origin: api.runtimeconfigOrigin,
      retryCodes: [500, 503],
    })
    .then(function(resp) {
      return Promise.resolve(resp.body.configs);
    });
}

function _createConfig(projectId, configId) {
  var path = _.join(["projects", projectId, "configs"], "/");
  var endpoint = utils.endpoint([API_VERSION, path]);
  return api
    .request("POST", endpoint, {
      auth: true,
      origin: api.runtimeconfigOrigin,
      data: {
        name: path + "/" + configId,
      },
      retryCodes: [500, 503],
    })
    .catch(function(err) {
      if (_.get(err, "context.response.statusCode") === 409) {
        // Config has already been created as part of a parallel operation during firebase functions:config:set
        return Promise.resolve();
      }
      return Promise.reject(err);
    });
}

function _deleteConfig(projectId, configId) {
  return api
    .request("DELETE", utils.endpoint([API_VERSION, "projects", projectId, "configs", configId]), {
      auth: true,
      origin: api.runtimeconfigOrigin,
      retryCodes: [500, 503],
    })
    .catch(function(err) {
      if (_.get(err, "context.response.statusCode") === 404) {
        logger.debug("Config already deleted.");
        return Promise.resolve();
      }
      return Promise.reject(err);
    });
}

function _listVariables(configPath) {
  return api
    .request("GET", utils.endpoint([API_VERSION, configPath, "variables"]), {
      auth: true,
      origin: api.runtimeconfigOrigin,
      retryCodes: [500, 503],
    })
    .then(function(resp) {
      return Promise.resolve(resp.body.variables);
    });
}

function _getVariable(varPath) {
  return api
    .request("GET", utils.endpoint([API_VERSION, varPath]), {
      auth: true,
      origin: api.runtimeconfigOrigin,
      retryCodes: [500, 503],
    })
    .then(function(resp) {
      return Promise.resolve(resp.body);
    });
}

function _createVariable(projectId, configId, varId, value) {
  var path = _.join(["projects", projectId, "configs", configId, "variables"], "/");
  var endpoint = utils.endpoint([API_VERSION, path]);
  return api
    .request("POST", endpoint, {
      auth: true,
      origin: api.runtimeconfigOrigin,
      data: {
        name: path + "/" + varId,
        text: value,
      },
      retryCodes: [500, 503],
    })
    .catch(function(err) {
      if (_.get(err, "context.response.statusCode") === 404) {
        // parent config doesn't exist yet
        return _createConfig(projectId, configId).then(function() {
          return _createVariable(projectId, configId, varId, value);
        });
      }
      return Promise.reject(err);
    });
}

function _updateVariable(projectId, configId, varId, value) {
  var path = _.join(["projects", projectId, "configs", configId, "variables", varId], "/");
  var endpoint = utils.endpoint([API_VERSION, path]);
  return api.request("PUT", endpoint, {
    auth: true,
    origin: api.runtimeconfigOrigin,
    data: {
      name: path,
      text: value,
    },
    retryCodes: [500, 503],
  });
}
function _setVariable(projectId, configId, varId, value) {
  var path = _.join(["projects", projectId, "configs", configId, "variables", varId], "/");
  return _getVariable(path)
    .then(function() {
      return _updateVariable(projectId, configId, varId, value);
    })
    .catch(function(err) {
      if (_.get(err, "context.response.statusCode") === 404) {
        return _createVariable(projectId, configId, varId, value);
      }
      return Promise.reject(err);
    });
}

function _deleteVariable(projectId, configId, varId) {
  var endpoint =
    utils.endpoint([API_VERSION, "projects", projectId, "configs", configId, "variables", varId]) +
    "?recursive=true";
  return api
    .request("DELETE", endpoint, {
      auth: true,
      origin: api.runtimeconfigOrigin,
      retryCodes: [500, 503],
    })
    .catch(function(err) {
      if (_.get(err, "context.response.statusCode") === 404) {
        logger.debug("Variable already deleted.");
        return Promise.resolve();
      }
      return Promise.reject(err);
    });
}

module.exports = {
  configs: {
    list: _listConfigs,
    create: _createConfig,
    delete: _deleteConfig,
  },
  variables: {
    list: _listVariables,
    get: _getVariable,
    set: _setVariable,
    delete: _deleteVariable,
  },
};
