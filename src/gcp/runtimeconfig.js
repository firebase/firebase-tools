"use strict";

const { runtimeconfigOrigin } = require("../api");
const { Client } = require("../apiv2");

const { logger } = require("../logger");
var _ = require("lodash");

const API_VERSION = "v1beta1";
const apiClient = new Client({ urlPrefix: runtimeconfigOrigin, apiVersion: API_VERSION });

function _listConfigs(projectId) {
  return apiClient
    .get(`/projects/${projectId}/configs`, {
      retryCodes: [500, 503],
    })
    .then(function (resp) {
      return resp.body.configs;
    });
}

function _createConfig(projectId, configId) {
  var path = _.join(["projects", projectId, "configs"], "/");
  return apiClient
    .post(
      `/projects/${projectId}/configs`,
      {
        name: path + "/" + configId,
      },
      {
        retryCodes: [500, 503],
      }
    )
    .catch(function (err) {
      if (_.get(err, "context.response.statusCode") === 409) {
        // Config has already been created as part of a parallel operation during firebase functions:config:set
        return Promise.resolve();
      }
      return Promise.reject(err);
    });
}

function _deleteConfig(projectId, configId) {
  return apiClient
    .delete(`/projects/${projectId}/configs/${configId}`, {
      retryCodes: [500, 503],
    })
    .catch(function (err) {
      if (_.get(err, "context.response.statusCode") === 404) {
        logger.debug("Config already deleted.");
        return Promise.resolve();
      }
      return Promise.reject(err);
    });
}

function _listVariables(configPath) {
  return apiClient
    .get(`${configPath}/variables`, {
      retryCodes: [500, 503],
    })
    .then(function (resp) {
      return Promise.resolve(resp.body.variables);
    });
}

function _getVariable(varPath) {
  return apiClient
    .get(varPath, {
      retryCodes: [500, 503],
    })
    .then(function (resp) {
      return Promise.resolve(resp.body);
    });
}

function _createVariable(projectId, configId, varId, value) {
  const path = `/projects/${projectId}/configs/${configId}/variables`;
  return apiClient
    .post(
      path,
      {
        name: `${path}/${varId}`,
        text: value,
      },
      {
        retryCodes: [500, 503],
      }
    )
    .catch(function (err) {
      if (_.get(err, "context.response.statusCode") === 404) {
        // parent config doesn't exist yet
        return _createConfig(projectId, configId).then(function () {
          return _createVariable(projectId, configId, varId, value);
        });
      }
      return Promise.reject(err);
    });
}

function _updateVariable(projectId, configId, varId, value) {
  const path = `/projects/${projectId}/configs/${configId}/variables/${varId}`;
  return apiClient.put(
    path,
    {
      name: path,
      text: value,
    },
    {
      retryCodes: [500, 503],
    }
  );
}

function _setVariable(projectId, configId, varId, value) {
  var path = _.join(["projects", projectId, "configs", configId, "variables", varId], "/");
  return _getVariable(path)
    .then(function () {
      return _updateVariable(projectId, configId, varId, value);
    })
    .catch(function (err) {
      if (_.get(err, "context.response.statusCode") === 404) {
        return _createVariable(projectId, configId, varId, value);
      }
      return Promise.reject(err);
    });
}

function _deleteVariable(projectId, configId, varId) {
  return apiClient
    .delete(`/projects/${projectId}/configs/${configId}/variables/${varId}`, {
      retryCodes: [500, 503],
      queryParams: { recursive: "true" },
    })
    .catch(function (err) {
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
