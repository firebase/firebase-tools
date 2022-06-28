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

// This is an independently executed script that parses triggers
// from a functions package directory.
"use strict";

var url = require("url");
var extractTriggers = require("./extractTriggers");
var EXIT = function () {
  process.exit(0);
};

/**
 * Dynamically load import function to prevent TypeScript from
 * transpiling into a require.
 *
 * See https://github.com/microsoft/TypeScript/issues/43329.
 */
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function loadModule(packageDir) {
  try {
    return require(packageDir);
  } catch (e) {
    if (e.code === "ERR_REQUIRE_ESM") {
      const modulePath = require.resolve(packageDir);
      // Resolve module path to file:// URL. Required for windows support.
      const moduleURL = url.pathToFileURL(modulePath).href;
      return await dynamicImport(moduleURL);
    }
    throw e;
  }
}

(async function () {
  if (!process.send) {
    console.warn("Could not parse function triggers (process.send === undefined).");
    process.exit(1);
  }

  // wrap in function to allow return without exiting process
  var packageDir = process.argv[2];
  if (!packageDir) {
    process.send({ error: "Must supply package directory for functions trigger parsing." }, EXIT);
    return;
  }

  var mod;
  var triggers = [];
  try {
    mod = await loadModule(packageDir);
  } catch (e) {
    if (e.code === "MODULE_NOT_FOUND") {
      process.send(
        {
          error:
            "Error parsing triggers: " +
            e.message +
            '\n\nTry running "npm install" in your functions directory before deploying.',
        },
        EXIT
      );
      return;
    }
    if (/Firebase config variables are not available/.test(e.message)) {
      process.send(
        {
          error:
            "Error occurred while parsing your function triggers. " +
            'Please ensure you have the latest firebase-functions SDK by running "npm i --save firebase-functions@latest" inside your functions folder.\n\n' +
            e.stack,
        },
        EXIT
      );
      return;
    }

    process.send(
      {
        error: "Error occurred while parsing your function triggers.\n\n" + e.stack,
      },
      EXIT
    );
    return;
  }

  try {
    extractTriggers(mod, triggers);
  } catch (err) {
    if (/Maximum call stack size exceeded/.test(err.message)) {
      process.send(
        {
          error:
            "Error occurred while parsing your function triggers. Please ensure that index.js only " +
            "exports cloud functions.\n\n",
        },
        EXIT
      );
      return;
    }
    process.send({ error: err.message }, EXIT);
  }

  process.send({ triggers: triggers }, EXIT);
})();
