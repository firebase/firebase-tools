"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.variables = exports.configs = void 0;
const _ = require("lodash");
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const logger_1 = require("../logger");
const API_VERSION = "v1beta1";
const apiClient = new apiv2_1.Client({ urlPrefix: (0, api_1.runtimeconfigOrigin)(), apiVersion: API_VERSION });
function listConfigs(projectId) {
    return apiClient
        .get(`/projects/${projectId}/configs`, {
        retryCodes: [500, 503],
    })
        .then((resp) => resp.body.configs);
}
function createConfig(projectId, configId) {
    const path = ["projects", projectId, "configs"].join("/");
    return apiClient
        .post(`/projects/${projectId}/configs`, {
        name: path + "/" + configId,
    }, {
        retryCodes: [500, 503],
    })
        .catch((err) => {
        if (_.get(err, "context.response.statusCode") === 409) {
            // Config has already been created as part of a parallel operation during firebase functions:config:set
            return Promise.resolve();
        }
        return Promise.reject(err);
    });
}
function deleteConfig(projectId, configId) {
    return apiClient
        .delete(`/projects/${projectId}/configs/${configId}`, {
        retryCodes: [500, 503],
    })
        .catch((err) => {
        if (_.get(err, "context.response.statusCode") === 404) {
            logger_1.logger.debug("Config already deleted.");
            return Promise.resolve();
        }
        throw err;
    });
}
function listVariables(configPath) {
    return apiClient
        .get(`${configPath}/variables`, {
        retryCodes: [500, 503],
    })
        .then((resp) => {
        return Promise.resolve(resp.body.variables || []);
    });
}
function getVariable(varPath) {
    return apiClient
        .get(varPath, {
        retryCodes: [500, 503],
    })
        .then((resp) => {
        return Promise.resolve(resp.body);
    });
}
function createVariable(projectId, configId, varId, value) {
    const path = `/projects/${projectId}/configs/${configId}/variables`;
    return apiClient
        .post(path, {
        name: `${path}/${varId}`,
        text: value,
    }, {
        retryCodes: [500, 503],
    })
        .catch((err) => {
        if (_.get(err, "context.response.statusCode") === 404) {
            // parent config doesn't exist yet
            return createConfig(projectId, configId).then(() => {
                return createVariable(projectId, configId, varId, value);
            });
        }
        return Promise.reject(err);
    });
}
function updateVariable(projectId, configId, varId, value) {
    const path = `/projects/${projectId}/configs/${configId}/variables/${varId}`;
    return apiClient.put(path, {
        name: path,
        text: value,
    }, {
        retryCodes: [500, 503],
    });
}
function setVariable(projectId, configId, varId, value) {
    const path = ["projects", projectId, "configs", configId, "variables", varId].join("/");
    return getVariable(path)
        .then(() => {
        return updateVariable(projectId, configId, varId, value);
    })
        .catch((err) => {
        if (_.get(err, "context.response.statusCode") === 404) {
            return createVariable(projectId, configId, varId, value);
        }
        return Promise.reject(err);
    });
}
function deleteVariable(projectId, configId, varId) {
    return apiClient
        .delete(`/projects/${projectId}/configs/${configId}/variables/${varId}`, {
        retryCodes: [500, 503],
        queryParams: { recursive: "true" },
    })
        .catch((err) => {
        if (_.get(err, "context.response.statusCode") === 404) {
            logger_1.logger.debug("Variable already deleted.");
            return Promise.resolve();
        }
        return Promise.reject(err);
    });
}
exports.configs = {
    list: listConfigs,
    create: createConfig,
    delete: deleteConfig,
};
exports.variables = {
    list: listVariables,
    get: getVariable,
    set: setVariable,
    delete: deleteVariable,
};
