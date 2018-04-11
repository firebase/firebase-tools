"use strict";

var api = require("../api");

var utils = require("../utils");
var _ = require("lodash");
var logger = require("../logger");
var chalk = require("chalk");

var API_VERSION = "v1";

function _functionsOpLogReject(func, type, err) {
  utils.logWarning(chalk.bold.yellow("functions:") + " failed to " + type + " function " + func);
  if (err.context.response.statusCode === 429) {
    logger.debug(err.message);
    logger.info(
      "You have exceeded your deployment quota, please deploy your functions in batches by using the --only flag, " +
        "and wait a few minutes before deploying again. Go to https://firebase.google.com/docs/cli/#partial_deploys to learn more."
    );
  } else {
    logger.info(err.message);
  }
  return Promise.reject(err.message);
}

function _generateUploadUrl(projectId, location) {
  var parent = "projects/" + projectId + "/locations/" + location;
  var endpoint = "/" + API_VERSION + "/" + parent + "/functions:generateUploadUrl";
  return api
    .request("POST", endpoint, {
      auth: true,
      json: false,
      origin: api.functionsOrigin,
    })
    .then(
      function(result) {
        var responseBody = JSON.parse(result.body);
        return Promise.resolve(responseBody.uploadUrl);
      },
      function(err) {
        logger.info(
          "\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support."
        );
        return Promise.reject(err);
      }
    );
}

function _createFunction(options) {
  var location = "projects/" + options.projectId + "/locations/" + options.region;
  var func = location + "/functions/" + options.functionName;
  var endpoint = "/" + API_VERSION + "/" + location + "/functions";
  var data = {
    sourceUploadUrl: options.sourceUploadUrl,
    name: func,
    entryPoint: options.entryPoint,
    labels: options.labels,
  };
  if (options.availableMemory) {
    data.availableMemoryMb = options.availableMemory;
  }
  if (options.functionTimeout) {
    data.timeout = options.functionTimeout;
  }
  return api
    .request("POST", endpoint, {
      auth: true,
      data: _.assign(data, options.trigger),
      origin: api.functionsOrigin,
    })
    .then(
      function(resp) {
        return Promise.resolve({
          func: func,
          eventType: options.eventType,
          done: false,
          name: resp.body.name,
          type: "create",
        });
      },
      function(err) {
        return _functionsOpLogReject(options.functionName, "create", err);
      }
    );
}

function _updateFunction(options) {
  var location = "projects/" + options.projectId + "/locations/" + options.region;
  var func = location + "/functions/" + options.functionName;
  var endpoint = "/" + API_VERSION + "/" + func;
  var data = _.assign(
    {
      sourceUploadUrl: options.sourceUploadUrl,
      name: func,
      labels: options.labels,
    },
    options.trigger
  );

  var masks = ["sourceUploadUrl", "name", "labels"];
  if (options.trigger.eventTrigger) {
    masks = _.concat(
      masks,
      _.map(_.keys(options.trigger.eventTrigger), function(subkey) {
        return "eventTrigger." + subkey;
      })
    );
  } else {
    masks = _.concat(masks, "httpsTrigger");
  }

  return api
    .request("PATCH", endpoint, {
      qs: {
        updateMask: masks.join(","),
      },
      auth: true,
      data: data,
      origin: api.functionsOrigin,
    })
    .then(
      function(resp) {
        return Promise.resolve({
          func: func,
          done: false,
          name: resp.body.name,
          type: "update",
        });
      },
      function(err) {
        return _functionsOpLogReject(options.functionName, "update", err);
      }
    );
}

function _deleteFunction(options) {
  var location = "projects/" + options.projectId + "/locations/" + options.region;
  var func = location + "/functions/" + options.functionName;
  var endpoint = "/" + API_VERSION + "/" + func;
  return api
    .request("DELETE", endpoint, {
      auth: true,
      origin: api.functionsOrigin,
    })
    .then(
      function(resp) {
        return Promise.resolve({
          func: func,
          done: false,
          name: resp.body.name,
          type: "delete",
        });
      },
      function(err) {
        return _functionsOpLogReject(options.functionName, "delete", err);
      }
    );
}

function _listFunctions(projectId, region) {
  var endpoint =
    "/" + API_VERSION + "/projects/" + projectId + "/locations/" + region + "/functions";
  return api
    .request("GET", endpoint, {
      auth: true,
      origin: api.functionsOrigin,
    })
    .then(
      function(resp) {
        var functionsList = resp.body.functions || [];
        _.forEach(functionsList, function(f) {
          f.functionName = f.name.substring(f.name.lastIndexOf("/") + 1);
        });
        return Promise.resolve(functionsList);
      },
      function(err) {
        logger.debug("[functions] failed to list functions for " + projectId);
        logger.debug("[functions] " + err.message);
        return Promise.reject(err.message);
      }
    );
}

function _checkOperation(operation) {
  return api
    .request("GET", "/" + API_VERSION + "/" + operation.name, {
      auth: true,
      origin: api.functionsOrigin,
    })
    .then(
      function(resp) {
        if (resp.body.done) {
          operation.done = true;
        }
        if (_.has(resp.body, "error")) {
          operation.error = resp.body.error;
        }
        return Promise.resolve(operation);
      },
      function(err) {
        logger.debug("[functions] failed to get status of operation: " + operation.name);
        logger.debug("[functions] " + err.message);
        operation.error = err;
        return Promise.reject(err.message);
      }
    );
}

module.exports = {
  DEFAULT_REGION: "us-central1",
  generateUploadUrl: _generateUploadUrl,
  create: _createFunction,
  update: _updateFunction,
  delete: _deleteFunction,
  list: _listFunctions,
  check: _checkOperation,
};
