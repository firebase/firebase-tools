'use strict';

var _ = require('lodash');
var request = require('request');

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
    return console.warn('\nERROR SENDING REQUEST: ' + err);
  }
  var status = response ? response.statusCode + ', ' : '';
  return console.log('\nRESPONSE RECEIVED FROM FUNCTION: ' + status + body);
};

var CallableFunction = function(trigger, urls, controller) {
  this.name = trigger.name;
  this.eventTrigger = trigger.eventTrigger;
  this.httpsTrigger = trigger.httpsTrigger;
  this.controller = controller;
  if (this.httpsTrigger) {
    this.call = request.defaults({
      callback: _requestCallBack,
      baseUrl: _.get(urls, this.name),
      uri: ''
    });
  } else {
    this.call = _call.bind(this);
  }
};

module.exports = CallableFunction;
