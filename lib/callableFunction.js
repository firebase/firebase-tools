'use strict';

var _ = require('lodash');
var request = require('request');
var baseUrl;

var _isDatabaseFunc = function(eventTrigger) {
  return /firebase.database/.test(eventTrigger.eventType);
};

var _substituteParams = function(resource, params) {
  var wildcards = resource.match(new RegExp('{[^/{}]*}', 'g'));
  _.forEach(wildcards, function(wildcard) {
    var wildcardNoBraces = wildcard.slice(1, -1); // .slice removes '{' and '}' from wildcard
    var sub = _.get(params, wildcardNoBraces);
    if (sub) {
      resource = _.replace(resource, wildcard, sub);
    } else {
      resource = _.replace(resource, wildcard, wildcardNoBraces + '1');
    }
  });
  return resource;
};

var _call = function(data, opts) {
  opts = opts || {};
  if (this.httpsTrigger) {
    this.controller.call(this.name, data || {});
  } else if (this.eventTrigger) {
    if (_isDatabaseFunc(this.eventTrigger)) {
      var operationType = _.last(this.eventTrigger.eventType.split('.'));
      var dataPayload;
      if (operationType === 'create') {
        dataPayload = {
          data: null,
          delta: data
        };
      } else if (operationType === 'update' || operationType === 'write') {
        dataPayload = {
          data: data.before,
          delta: data.after
        };
      } else if (operationType === 'delete') {
        dataPayload = {
          data: data,
          delta: null
        };
      }
      opts.resource = _substituteParams(this.eventTrigger.resource, opts.params);
      this.controller.call(this.name, dataPayload, opts);
    } else {
      this.controller.call(this.name, data || {}, opts);
    }
  }
  return 'Successfully invoked function.';
};

var _requestCallBack = function(err, response, body) {
  if (err) {
    return console.warn('ERROR SENDING REQUEST: ' + err);
  }
  var status = response ? response.statusCode + ', ' : '';
  return console.log('RESPONSE RECEIVED FROM FUNCTION: ' + status + body);
};

var _fullUrl = function(path) {
  var sanitizedPath;
  if (path) {
    sanitizedPath = (path.split('/')).join('/');
  }
  return [baseUrl, sanitizedPath].join('/');
};

var _request = function(path, options) {
  request(_fullUrl(path), options, _requestCallBack);
  return 'Sent request to function.';
};

var _verbFunc = function(verb) {
  return function(path, options) {
    request[verb](_fullUrl(path), options, _requestCallBack);
    return 'Sent request to function.';
  };
};

_request.get = _verbFunc('get');
_request.head = _verbFunc('head');
_request.options = _verbFunc('options');
_request.post = _verbFunc('post');
_request.put = _verbFunc('put');
_request.patch = _verbFunc('patch');
_request.del = _verbFunc('delete');
_request.delete = _verbFunc('delete');
_request.cookie = request.cookie;
_request.jar = request.jar;

var CallableFunction = function(trigger, urls, controller) {
  this.name = trigger.name;
  this.eventTrigger = trigger.eventTrigger;
  this.httpsTrigger = trigger.httpsTrigger;
  this.controller = controller;
  this.urls = urls;
  if (this.httpsTrigger) {
    baseUrl = _.get(this.urls, this.name);
    this.call = _request;
  } else {
    this.call = _call.bind(this);
  }
};

module.exports = CallableFunction;
