// NOTE: DO NOT ADD NPM DEPENDENCIES TO THIS FILE. It is executed
// as part of the trigger parser which should be a vanilla Node.js
// script.
"use strict";

var extractTriggers = function(mod, triggers, prefix) {
  prefix = prefix || "";
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
      trigger.name = prefix + funcName;
      trigger.entryPoint = trigger.name.replace(/-/g, ".");
      triggers.push(trigger);
    } else if (typeof child === "object" && child !== null) {
      extractTriggers(child, triggers, prefix + funcName + "-");
    }
  }
};

module.exports = extractTriggers;
