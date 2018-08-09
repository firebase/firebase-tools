"use strict";

var _ = require("lodash");

var clc = require("cli-color");
var api = require("./api");
var FirebaseError = require("./error");
var runtimeconfig = require("./gcp/runtimeconfig");
var getProjectId = require("./getProjectId");
var getProjectNumber = require("./getProjectNumber");
var ensureApiEnabled = require("./ensureApiEnabled").ensure;

exports.RESERVED_NAMESPACES = ["firebase"];

var _keyToIds = function(key) {
  var keyParts = key.split(".");
  var variable = keyParts.slice(1).join("/");
  return {
    config: keyParts[0],
    variable: variable,
  };
};

var _setVariable = function(projectId, configId, varPath, val) {
  if (configId === "" || varPath === "") {
    var msg = "Invalid argument, each config value must have a 2-part key (e.g. foo.bar).";
    throw new FirebaseError(msg);
  }
  return runtimeconfig.variables.set(projectId, configId, varPath, val);
};

exports.ensureApi = function(options) {
  var projectId = getProjectId(options);
  return ensureApiEnabled(projectId, "runtimeconfig.googleapis.com", "runtimeconfig", true);
};

exports.varNameToIds = function(varName) {
  return {
    config: varName.match(new RegExp("/configs/(.+)/variables/"))[1],
    variable: varName.match(new RegExp("/variables/(.+)"))[1],
  };
};

exports.idsToVarName = function(projectId, configId, varId) {
  return _.join(["projects", projectId, "configs", configId, "variables", varId], "/");
};

exports.getFirebaseConfig = function(options) {
  return getProjectNumber(options)
    .then(function(projectNumber) {
      return api.request("GET", "/v1/projects/" + projectNumber + ":getServerAppConfig", {
        auth: true,
        origin: api.firedataOrigin,
      });
    })
    .then(function(response) {
      return response.body;
    });
};

// If you make changes to this function, run "node scripts/test-functions-config.js"
// to ensure that nothing broke.
exports.setVariablesRecursive = function(projectId, configId, varPath, val) {
  var parsed = val;
  if (_.isString(val)) {
    try {
      // Only attempt to parse 'val' if it is a String (takes care of unparsed JSON, numbers, quoted string, etc.)
      parsed = JSON.parse(val);
    } catch (e) {
      // 'val' is just a String
    }
  }
  // If 'parsed' is object, call again
  if (_.isPlainObject(parsed)) {
    return Promise.all(
      _.map(parsed, function(item, key) {
        var newVarPath = varPath ? _.join([varPath, key], "/") : key;
        return exports.setVariablesRecursive(projectId, configId, newVarPath, item);
      })
    );
  }

  // 'val' wasn't more JSON, i.e. is a leaf node; set and return
  return _setVariable(projectId, configId, varPath, val);
};

exports.materializeConfig = function(configName, output) {
  var _materializeVariable = function(varName) {
    return runtimeconfig.variables.get(varName).then(function(variable) {
      var id = exports.varNameToIds(variable.name);
      var key = id.config + "." + id.variable.split("/").join(".");
      _.set(output, key, variable.text);
    });
  };

  var _traverseVariables = function(variables) {
    return Promise.all(
      _.map(variables, function(variable) {
        return _materializeVariable(variable.name);
      })
    );
  };

  return runtimeconfig.variables
    .list(configName)
    .then(function(variables) {
      return _traverseVariables(variables);
    })
    .then(function() {
      return output;
    });
};

exports.materializeAll = function(projectId) {
  var output = {};
  return runtimeconfig.configs.list(projectId).then(function(configs) {
    return Promise.all(
      _.map(configs, function(config) {
        if (config.name.match(new RegExp("configs/firebase"))) {
          // ignore firebase config
          return Promise.resolve();
        }
        return exports.materializeConfig(config.name, output);
      })
    ).then(function() {
      return output;
    });
  });
};

exports.parseSetArgs = function(args) {
  var parsed = [];
  _.forEach(args, function(arg) {
    var parts = arg.split("=");
    var key = parts[0];
    if (parts.length < 2) {
      throw new FirebaseError("Invalid argument " + clc.bold(arg) + ", must be in key=val format");
    }
    if (/[A-Z]/.test(key)) {
      throw new FirebaseError("Invalid config name " + clc.bold(key) + ", cannot use upper case.");
    }

    var id = _keyToIds(key);
    if (_.includes(exports.RESERVED_NAMESPACES, id.config.toLowerCase())) {
      throw new FirebaseError("Cannot set to reserved namespace " + clc.bold(id.config));
    }

    var val = parts.slice(1).join("="); // So that someone can have '=' within a variable value
    parsed.push({
      configId: id.config,
      varId: id.variable,
      val: val,
    });
  });
  return parsed;
};

exports.parseUnsetArgs = function(args) {
  var parsed = [];
  var splitArgs = [];
  _.forEach(args, function(arg) {
    splitArgs = _.union(splitArgs, arg.split(","));
  });

  _.forEach(splitArgs, function(key) {
    var id = _keyToIds(key);
    if (_.includes(exports.RESERVED_NAMESPACES, id.config.toLowerCase())) {
      throw new FirebaseError("Cannot unset reserved namespace " + clc.bold(id.config));
    }

    parsed.push({
      configId: id.config,
      varId: id.variable,
    });
  });
  return parsed;
};
