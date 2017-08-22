'use strict';

var _ = require('lodash');
var request = require('request');

var LocalFunction = function(trigger, urls, controller) {
  this.name = trigger.name;
  this.eventTrigger = trigger.eventTrigger;
  this.httpsTrigger = trigger.httpsTrigger;
  this.controller = controller;
  if (this.httpsTrigger) {
    this.call = request.defaults({
      callback: this._requestCallBack,
      baseUrl: _.get(urls, this.name),
      uri: ''
    });
  } else {
    this.call = this._call.bind(this);
  }
};

LocalFunction.prototype._isDatabaseFunc = function(eventTrigger) {
  return /firebase.database/.test(eventTrigger.eventType);
};

LocalFunction.prototype._substituteParams = function(resource, params) {
  var wildcardRegex = new RegExp('{[^/{}]*}', 'g');
  return resource.replace(wildcardRegex, function(wildcard) {
    var wildcardNoBraces = wildcard.slice(1, -1); // .slice removes '{' and '}' from wildcard
    var sub = _.get(params, wildcardNoBraces);
    return sub || wildcardNoBraces + _.random(1, 9);
  });
};

LocalFunction.prototype._requestCallBack = function(err, response, body) {
  if (err) {
    return console.warn('\nERROR SENDING REQUEST: ' + err);
  }
  var status = response ? response.statusCode + ', ' : '';
  return console.log('\nRESPONSE RECEIVED FROM FUNCTION: ' + status + body);
};

LocalFunction.prototype._call = function(data, opts) {
  opts = opts || {};
  if (this.httpsTrigger) {
    this.controller.call(this.name, data || {});
  } else if (this.eventTrigger) {
    if (this._isDatabaseFunc(this.eventTrigger)) {
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
      opts.resource = this._substituteParams(this.eventTrigger.resource, opts.params);
      this.controller.call(this.name, dataPayload, opts);
    } else {
      this.controller.call(this.name, data || {}, opts);
    }
  }
  return 'Successfully invoked function.';
};

module.exports = LocalFunction;
