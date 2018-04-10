"use strict";

var api = require("../api");

var utils = require("../utils");
var logger = require("../logger");
var _ = require("lodash");

var API_VERSION = "v1beta1";

function _retryOnServerError(requestFunction) {
  return requestFunction().catch(function(err) {
    if (_.includes([500, 503], _.get(err, "context.response.statusCode"))) {
      return new Promise(function(resolve) {
        setTimeout(resolve, 1000);
      }).then(requestFunction);
    }
    return Promise.reject(err);
  });
}

function _listConfigs(projectId) {
  return _retryOnServerError(function() {
    return api.request("GET", utils.endpoint([API_VERSION, "projects", projectId, "configs"]), {
      auth: true,
      origin: api.runtimeconfigOrigin,
    });
  }).then(function(resp) {
    return Promise.resolve(resp.body.configs);
  });
}

function _createConfig(projectId, configId) {
  var path = _.join(["projects", projectId, "configs"], "/");
  var endpoint = utils.endpoint([API_VERSION, path]);
  return _retryOnServerError(function() {
    return api.request("POST", endpoint, {
      auth: true,
      origin: api.runtimeconfigOrigin,
      data: {
        name: path + "/" + configId,
      },
    });
  }).catch(function(err) {
    if (_.get(err, "context.response.statusCode") === 409) {
      // Config has already been created as part of a parallel operation during firebase functions:config:set
      return Promise.resolve();
    }
    return Promise.reject(err);
  });
}

function _deleteConfig(projectId, configId) {
  return _retryOnServerError(function() {
    return api.request(
      "DELETE",
      utils.endpoint([API_VERSION, "projects", projectId, "configs", configId]),
      {
        auth: true,
        origin: api.runtimeconfigOrigin,
      }
    );
  }).catch(function(err) {
    if (_.get(err, "context.response.statusCode") === 404) {
      logger.debug("Config already deleted.");
      return Promise.resolve();
    }
    return Promise.reject(err);
  });
}

function _listVariables(configPath) {
  return _retryOnServerError(function() {
    return api.request("GET", utils.endpoint([API_VERSION, configPath, "variables"]), {
      auth: true,
      origin: api.runtimeconfigOrigin,
    });
  }).then(function(resp) {
    return Promise.resolve(resp.body.variables);
  });
}

function _getVariable(varPath) {
  return _retryOnServerError(function() {
    return api.request("GET", utils.endpoint([API_VERSION, varPath]), {
      auth: true,
      origin: api.runtimeconfigOrigin,
    });
  }).then(function(resp) {
    return Promise.resolve(resp.body);
  });
}

function _createVariable(projectId, configId, varId, value) {
  var path = _.join(["projects", projectId, "configs", configId, "variables"], "/");
  var endpoint = utils.endpoint([API_VERSION, path]);
  return _retryOnServerError(function() {
    return api.request("POST", endpoint, {
      auth: true,
      origin: api.runtimeconfigOrigin,
      data: {
        name: path + "/" + varId,
        text: value,
      },
    });
  }).catch(function(err) {
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
  return _retryOnServerError(function() {
    return api.request("PUT", endpoint, {
      auth: true,
      origin: api.runtimeconfigOrigin,
      data: {
        name: path,
        text: value,
      },
    });
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
  return _retryOnServerError(function() {
    return api.request("DELETE", endpoint, {
      auth: true,
      origin: api.runtimeconfigOrigin,
    });
  }).catch(function(err) {
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
