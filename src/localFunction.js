"use strict";

var _ = require("lodash");
var request = require("request");

var { encodeFirestoreValue } = require("./firestore/encodeFirestoreValue");
var utils = require("./utils");

var LocalFunction = function(trigger, urls, controller) {
  const isCallable = _.get(trigger, ["labels", "deployment-callable"], "false");

  this.name = trigger.name;
  this.eventTrigger = trigger.eventTrigger;
  this.httpsTrigger = trigger.httpsTrigger;
  this.controller = controller;
  this.url = _.get(urls, this.name);

  if (this.httpsTrigger) {
    if (isCallable == "true") {
      this.call = this._constructCallableFunc.bind(this);
    } else {
      this.call = request.defaults({
        callback: this._requestCallBack,
        baseUrl: this.url,
        uri: "",
      });
    }
  } else {
    this.call = this._call.bind(this);
  }
};

LocalFunction.prototype._isDatabaseFunc = function(eventTrigger) {
  return utils.getFunctionsEventProvider(eventTrigger.eventType) === "Database";
};

LocalFunction.prototype._isFirestoreFunc = function(eventTrigger) {
  return utils.getFunctionsEventProvider(eventTrigger.eventType) === "Firestore";
};

LocalFunction.prototype._substituteParams = function(resource, params) {
  var wildcardRegex = new RegExp("{[^/{}]*}", "g");
  return resource.replace(wildcardRegex, function(wildcard) {
    var wildcardNoBraces = wildcard.slice(1, -1); // .slice removes '{' and '}' from wildcard
    var sub = _.get(params, wildcardNoBraces);
    return sub || wildcardNoBraces + _.random(1, 9);
  });
};

LocalFunction.prototype._constructCallableFunc = function(data, opts) {
  opts = opts || {};

  var headers = {};
  if (_.has(opts.instanceIdToken)) {
    headers["Firebase-Instance-ID-Token"] = opts.instanceIdToken;
  }

  return request.post({
    callback: this._requestCallBack,
    baseUrl: this.url,
    uri: "",
    body: { data: data },
    json: true,
    headers: headers,
  });
};

LocalFunction.prototype._constructAuth = function(auth, authType) {
  if (_.get(auth, "admin") || _.get(auth, "variable")) {
    return auth; // User is providing the wire auth format already.
  }
  if (typeof authType !== "undefined") {
    switch (authType) {
      case "USER":
        return {
          variable: {
            uid: _.get(auth, "uid", ""),
            token: _.get(auth, "token", {}),
          },
        };
      case "ADMIN":
        if (_.get(auth, "uid") || _.get(auth, "token")) {
          throw new Error("authType and auth are incompatible.");
        }
        return { admin: true };
      case "UNAUTHENTICATED":
        if (_.get(auth, "uid") || _.get(auth, "token")) {
          throw new Error("authType and auth are incompatible.");
        }
        return { admin: false };
      default:
        throw new Error(
          "Unrecognized authType, valid values are: " + "ADMIN, USER, and UNAUTHENTICATED"
        );
    }
  }
  if (auth) {
    return {
      variable: {
        uid: auth.uid,
        token: auth.token || {},
      },
    };
  }
  // Default to admin
  return { admin: true };
};

LocalFunction.prototype._makeFirestoreValue = function(input) {
  if (typeof input === "undefined" || _.isEmpty(input)) {
    // Document does not exist.
    return {};
  }
  if (typeof input !== "object") {
    throw new Error("Firestore data must be key-value pairs.");
  }
  var currentTime = new Date().toISOString();
  return {
    fields: encodeFirestoreValue(input),
    createTime: currentTime,
    updateTime: currentTime,
  };
};

LocalFunction.prototype._requestCallBack = function(err, response, body) {
  if (err) {
    return console.warn("\nERROR SENDING REQUEST: " + err);
  }
  var status = response ? response.statusCode + ", " : "";

  // If the body is a string we want to check if we can parse it as JSON
  // and pretty-print it. We can't blindly stringify because stringifying
  // a string results in some ugly escaping.
  var bodyString = body;
  if (typeof body === "string") {
    try {
      bodyString = JSON.stringify(JSON.parse(bodyString), null, 2);
    } catch (e) {
      // Ignore
    }
  } else {
    bodyString = JSON.stringify(body, null, 2);
  }

  return console.log("\nRESPONSE RECEIVED FROM FUNCTION: " + status + bodyString);
};

LocalFunction.prototype._call = function(data, opts) {
  opts = opts || {};
  var operationType;
  var dataPayload;

  if (this.httpsTrigger) {
    this.controller.call(this.name, data || {});
  } else if (this.eventTrigger) {
    if (this._isDatabaseFunc(this.eventTrigger)) {
      operationType = _.last(this.eventTrigger.eventType.split("."));
      switch (operationType) {
        case "create":
          dataPayload = {
            data: null,
            delta: data,
          };
          break;
        case "delete":
          dataPayload = {
            data: data,
            delta: null,
          };
          break;
        default:
          // 'update' or 'write'
          dataPayload = {
            data: data.before,
            delta: data.after,
          };
      }
      opts.resource = this._substituteParams(this.eventTrigger.resource, opts.params);
      opts.auth = this._constructAuth(opts.auth, opts.authType);
      this.controller.call(this.name, dataPayload, opts);
    } else if (this._isFirestoreFunc(this.eventTrigger)) {
      operationType = _.last(this.eventTrigger.eventType.split("."));
      switch (operationType) {
        case "create":
          dataPayload = {
            value: this._makeFirestoreValue(data),
            oldValue: {},
          };
          break;
        case "delete":
          dataPayload = {
            value: {},
            oldValue: this._makeFirestoreValue(data),
          };
          break;
        default:
          // 'update' or 'write'
          dataPayload = {
            value: this._makeFirestoreValue(data.after),
            oldValue: this._makeFirestoreValue(data.before),
          };
      }
      opts.resource = this._substituteParams(this.eventTrigger.resource, opts.params);
      this.controller.call(this.name, dataPayload, opts);
    } else {
      this.controller.call(this.name, data || {}, opts);
    }
  }
  return "Successfully invoked function.";
};

module.exports = LocalFunction;
