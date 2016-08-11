'use strict';

var api = require('../api');
var RSVP = require('rsvp');
var utils = require('../utils');
var _ = require('lodash');
var logger = require('../logger');
var chalk = require('chalk');

var version = 'v1beta1';

function _functionsOpLogReject(func, type, err) {
  utils.logWarning(chalk.bold.yellow('functions:') + ' failed to ' + type + ' function ' + func);
  utils.logWarning(chalk.bold.yellow('functions: ') + err.message);
  return RSVP.reject(err.message);
}

function _createFunction(projectId, region, functionName, entryPoint, triggers, gcsUrl) {
  var location = 'projects/' + projectId + '/regions/' + region;
  var func = location + '/functions/' + functionName;
  var endpoint = '/' + version + '/' + location + '/functions';

  return api.request('POST', endpoint, {
    auth: true,
    data: {
      gcsUrl: gcsUrl,
      name: func,
      triggers: triggers,
      entryPoint: entryPoint
    },
    origin: api.functionsOrigin
  }).then(function(resp) {
    return RSVP.resolve({func: func, done: false, name: resp.body.name, type: 'create'});
  }, function(err) {
    return _functionsOpLogReject(functionName, 'create', err);
  });
}

function _updateFunction(projectId, region, functionName, entryPoint, triggers, gcsUrl) {
  var location = 'projects/' + projectId + '/regions/' + region;
  var func = location + '/functions/' + functionName;
  var endpoint = '/' + version + '/' + func;

  return api.request('PUT', endpoint, {
    auth: true,
    data: {
      gcsUrl: gcsUrl,
      name: func,
      triggers: triggers,
      entryPoint: entryPoint
    },
    origin: api.functionsOrigin
  }).then(function(resp) {
    return RSVP.resolve({func: func, done: false, name: resp.body.name, type: 'update'});
  }, function(err) {
    return _functionsOpLogReject(functionName, 'update', err);
  });
}

function _deleteFunction(projectId, region, functionName) {
  var location = 'projects/' + projectId + '/regions/' + region;
  var func = location + '/functions/' + functionName;
  var endpoint = '/' + version + '/' + func;
  return api.request('DELETE', endpoint, {
    auth: true,
    origin: api.functionsOrigin
  }).then(function(resp) {
    return RSVP.resolve({func: func, done: false, name: resp.body.name, type: 'delete'});
  }, function(err) {
    return _functionsOpLogReject(functionName, 'delete', err);
  });
}

function _listFunctions(projectId, region) {
  var endpoint = '/' + version + '/projects/' + projectId + '/regions/' + region + '/functions';
  return api.request('GET', endpoint, {
    auth: true,
    origin: api.functionsOrigin
  }).then(function(resp) {
    var functionsList = resp.body.functions;
    _.forEach(functionsList, function(f) {
      f.functionName = f.name.substring(f.name.lastIndexOf('/') + 1);
    });
    return RSVP.resolve(functionsList);
  }, function(err) {
    logger.debug('[functions] failed to list functions for ' + projectId);
    logger.debug('[functions] ' + err.message);
    return RSVP.reject(err.message);
  });
}

function _checkOperation(operation) {
  return api.request('GET', '/' + version + '/operations/' + operation.name, {
    auth: true,
    origin: api.functionsOrigin
  }).then(function(resp) {
    if (resp.body.done) {
      operation.done = true;
    }
    if (_.has(resp.body, 'error')) {
      operation.error = resp.body.error;
    }
    return RSVP.resolve(operation);
  }, function(err) {
    logger.debug('[functions] failed to get status of operation: ' + operation.name);
    logger.debug('[functions] ' + err.message);
    operation.error = err;
    return RSVP.reject(err.message);
  });
}

module.exports = {
  create: _createFunction,
  update: _updateFunction,
  delete: _deleteFunction,
  list: _listFunctions,
  check: _checkOperation
};
