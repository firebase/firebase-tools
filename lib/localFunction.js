'use strict';

var _ = require('lodash');
var is = require('is');
var request = require('request');

var instance;

var LocalFunction = function(trigger, urls, controller) {
  instance = this;
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

LocalFunction.prototype._isFirestoreFunc = function(eventTrigger) {
  return /cloud.firestore/.test(eventTrigger.eventType);
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

LocalFunction.prototype._encodeFirestoreValue = function(data) {
  var isPlainObject = function(input) {
    return typeof input === 'object' &&
      input !== null &&
      _.isEqual(Object.getPrototypeOf(input), Object.prototype);
  };

  var encodeHelper = function(val) {
    if (is.string(val)) {
      return {
        stringValue: val
      };
    }
    if (is.boolean(val)) {
      return {
        booleanValue: val
      };
    }
    if (is.integer(val)) {
      return {
        integerValue: val
      };
    }
    // Integers are handled above, the remaining numbers are treated as doubles
    if (is.number(val)) {
      return {
        doubleValue: val
      };
    }
    if (is.date(val)) {
      return {
        timestampValue: val.toISOString()
      };
    }
    if (is.array(val)) {
      var encodedElements = [];
      for (var i = 0; i < val.length; ++i) {
        var enc = encodeHelper(val[i]);
        if (enc) {
          encodedElements.push(enc);
        }
      }
      return {
        arrayValue: {
          values: encodedElements
        }
      };
    }
    if (is.nil(val)) {
      return {
        nullValue: 'NULL_VALUE'
      };
    }
    if (is.instanceof(val, Buffer) || is.instanceof(val, Uint8Array)) {
      return {
        bytesValue: val
      };
    }
    if (isPlainObject(val)) {
      return {
        mapValue: {
          fields: instance._encodeFirestoreValue(val)
        }
      };
    }
    throw new Error(
      'Cannot encode ' + val + 'to a Firestore Value.' +
      ' The emulator does not yet support Firestore document reference values or geo points.'
    );
  };

  return _.mapValues(data, encodeHelper);
};

LocalFunction.prototype._call = function(data, opts) {
  opts = opts || {};
  var operationType;
  var dataPayload;
  if (this.httpsTrigger) {
    this.controller.call(this.name, data || {});
  } else if (this.eventTrigger) {
    if (this._isDatabaseFunc(this.eventTrigger)) {
      operationType = _.last(this.eventTrigger.eventType.split('.'));
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
    } else if (this._isFirestoreFunc(this.eventTrigger)) {
      operationType = _.last(this.eventTrigger.eventType.split('.'));
      var currentTime =  (new Date()).toISOString();
      if (operationType === 'create') {
        dataPayload = {
          value: {
            fields: this._encodeFirestoreValue(data),
            createTime: currentTime,
            updateTime: currentTime
          },
          oldValue: {}
        };
      } else if (operationType === 'update' || operationType === 'write') {
        dataPayload = {
          value: {
            fields: this._encodeFirestoreValue(data.after),
            createTime: currentTime,
            updateTime: currentTime
          },
          oldValue: {
            fields: this._encodeFirestoreValue(data.before),
            createTime: currentTime,
            updateTime: currentTime
          }
        };
      } else if (operationType === 'delete') {
        dataPayload = {
          value: {},
          oldValue: {
            fields: this._encodeFirestoreValue(data),
            createTime: currentTime,
            updateTime: currentTime
          }
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
