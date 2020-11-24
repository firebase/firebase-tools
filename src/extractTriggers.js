// NOTE: DO NOT ADD NPM DEPENDENCIES TO THIS FILE. It is executed
// as part of the trigger parser which should be a vanilla Node.js
// script.
"use strict";

/**
 * @param {Object} mod module, usually the result of require(functions/index.js)
 * @param {Array<EmulatedTriggerDefinition>} triggers array of definitions to extend (in-place).
 * @param {string|undefined} prefix optional function name prefix, for example when using grouped functions.
 * @param {string|undefined} suffix optional function name suffix, for example to mark generation numbers.
 */
var extractTriggers = function(mod, triggers, prefix, suffix) {
  prefix = prefix || "";
  suffix = suffix || "";
  for (var funcName of Object.keys(mod)) {
    var child = mod[funcName];
    if (typeof child === "function" && child.__trigger && typeof child.__trigger === "object") {
      if (funcName.indexOf("-") >= 0) {
        throw new Error(
          'Function name "' + funcName + '" is invalid. Function names cannot contain dashes.'
        );
      }

      var trigger = {};
      for (var key of Object.keys(child.__trigger)) {
        trigger[key] = child.__trigger[key];
      }
      trigger.name = prefix + funcName + suffix;
      trigger.entryPoint = trigger.name.replace(/-/g, ".");
      triggers.push(trigger);
    } else if (typeof child === "object" && child !== null) {
      extractTriggers(child, triggers, prefix + funcName + "-", suffix);
    }
  }
};

module.exports = extractTriggers;
