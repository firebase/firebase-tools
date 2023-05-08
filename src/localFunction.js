"use strict";

var _ = require("lodash");
var { Client } = require("./apiv2");

var { encodeFirestoreValue } = require("./firestore/encodeFirestoreValue");
var utils = require("./utils");

const HTTPS_SENTINEL = "Request sent to function.";

/**
 * @constructor
 * @this LocalFunction
 *
 * @param {object} trigger
 * @param {object=} urls
 * @param {object=} controller
 */
var LocalFunction = function (trigger, urls, controller) {
  const isCallable = _.get(trigger, ["labels", "deployment-callable"], "false");

  this.id = trigger.id;
  this.name = trigger.name;
  this.eventTrigger = trigger.eventTrigger;
  this.httpsTrigger = trigger.httpsTrigger;
  this.controller = controller;
  this.url = _.get(urls, this.id);

  if (this.httpsTrigger) {
    if (isCallable == "true") {
      this.call = this._constructCallableFunc.bind(this);
    } else {
      const callClient = new Client({ urlPrefix: this.url, auth: false });
      this.call = (path) => {
        callClient
          .get(path || "/")
          .then((res) => {
            this._requestCallBack(undefined, res, res.body);
          })
          .catch((err) => {
            this._requestCallBack(err);
          });
        return HTTPS_SENTINEL;
      };
      this.call["get"] = (path) => {
        callClient["get"](path || "/")
          .then((res) => {
            this._requestCallBack(undefined, res, res.body);
          })
          .catch((err) => {
            this._requestCallBack(err);
          });
        return HTTPS_SENTINEL;
      };
      for (const method of ["post", "put", "patch", "delete"]) {
        this.call[method] = (...args) => {
          let path = "/";
          let data = {};
          if (args.length === 1 && typeof args[0] !== "string") {
            data = args[0];
          } else if (args.length === 2) {
            path = args[0];
            data = args[1];
          }
          callClient[method](path, data)
            .then((res) => {
              this._requestCallBack(undefined, res, res.body);
            })
            .catch((err) => {
              this._requestCallBack(err);
            });
          return HTTPS_SENTINEL;
        };
      }
    }
  } else {
    this.call = this._call.bind(this);
  }
};

LocalFunction.prototype._isDatabaseFunc = function (eventTrigger) {
  return utils.getFunctionsEventProvider(eventTrigger.eventType) === "Database";
};

LocalFunction.prototype._isFirestoreFunc = function (eventTrigger) {
  return utils.getFunctionsEventProvider(eventTrigger.eventType) === "Firestore";
};

LocalFunction.prototype._substituteParams = function (resource, params) {
  var wildcardRegex = new RegExp("{[^/{}]*}", "g");
  return resource.replace(wildcardRegex, function (wildcard) {
    var wildcardNoBraces = wildcard.slice(1, -1); // .slice removes '{' and '}' from wildcard
    var sub = _.get(params, wildcardNoBraces);
    return sub || wildcardNoBraces + utils.randomInt(1, 9);
  });
};

LocalFunction.prototype._constructCallableFunc = function (data, opts) {
  opts = opts || {};

  /** @type {{ [key: string]: string }} */
  var headers = {};
  if (opts.instanceIdToken) {
    headers["Firebase-Instance-ID-Token"] = opts.instanceIdToken;
  }

  const client = new Client({ urlPrefix: this.url, auth: false });
  void client
    .post("", data, { headers })
    .then((res) => {
      this._requestCallBack(undefined, res, res.body);
    })
    .catch((err) => {
      this._requestCallBack(err);
    });
};

LocalFunction.prototype._constructAuth = function (auth, authType) {
  if (auth?.admin || auth?.variable) {
    return auth; // User is providing the wire auth format already.
  }
  if (typeof authType !== "undefined") {
    switch (authType) {
      case "USER":
        return {
          variable: {
            uid: auth?.uid ?? "",
            token: auth?.token ?? {},
          },
        };
      case "ADMIN":
        if (auth?.uid || auth?.token) {
          throw new Error("authType and auth are incompatible.");
        }
        return { admin: true };
      case "UNAUTHENTICATED":
        if (auth?.uid || auth?.token) {
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

LocalFunction.prototype._makeFirestoreValue = function (input) {
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

LocalFunction.prototype._requestCallBack = function (err, response, body) {
  if (err) {
    return console.warn("\nERROR SENDING REQUEST: " + err);
  }
  var status = response ? response.status + ", " : "";

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

LocalFunction.prototype._call = function (data, opts) {
  opts = opts || {};
  var operationType;
  var dataPayload;

  if (this.httpsTrigger) {
    this.controller.call(this.name, data || {});
  } else if (this.eventTrigger) {
    if (this._isDatabaseFunc(this.eventTrigger)) {
      operationType = utils.last(this.eventTrigger.eventType.split("."));
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
      operationType = utils.last(this.eventTrigger.eventType.split("."));
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
module.exports.HTTPS_SENTINAL = HTTPS_SENTINEL;
