/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// NOTE: DO NOT ADD NPM DEPENDENCIES TO THIS FILE. It is executed
// as part of the trigger parser which should be a vanilla Node.js
// script.
"use strict";

/**
 * @param {Object} mod module, usually the result of require(functions/index.js)
 * @param {Array<object>} triggers array of ParsedTriggerDefinition to extend (in-place).
 * @param {string=} prefix optional function name prefix, for example when using grouped functions.
 */
var extractTriggers = function (mod, triggers, prefix) {
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
