// This is an independently executed script that parses triggers
// from a functions package directory.
// NOTE: DO NOT ADD NPM DEPENDENCIES TO THIS FILE. It is executed
// as part of the trigger parser which should be a vanilla Node.js
// script.
"use strict";

var path = require("path");
var extractTriggers = require("./extractTriggers");

function majorVersion(version) {
  var m = version.match(/v?([0-9]+)\..+/);
  if (!m) {
    throw new Error("Unrecognized node version: " + version);
  }
  return +m[1];
}

function loadModule(sourceDir) {
  var mod;
  try {
    return Promise.resolve(require(sourceDir));
  } catch (e) {
    if (e.code === "ERR_REQUIRE_ESM") {
      // ES module loader is only available in nodejs13 and up.
      if (majorVersion(process.version) < 13) {
        throw new Error(
          "ES modules are incompatible with Node.js " +
            process.version +
            ". Please upgrade Node.js version to v13 or greater."
        );
      }
      // ES module loader does not automatically look up module's package.json
      // 'main' attribute in sourceDir to locate the JS file to load.
      var pkg = require(path.join(sourceDir, "package.json"));
      mod = require("./import")(path.join(sourceDir, pkg.main || "index.js"));
      return mod;
    }
    throw e;
  }
}

var EXIT = function () {
  process.exit(0);
};

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
            e.code + "\n" +
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
  } catch (e) {
    if (/Maximum call stack size exceeded/.test(e.message)) {
      process.send(
        {
          error:
            "Error occurred while parsing your function triggers. Please ensure that index.js only " +
            "exports cloud functions.\n\n",
        },
        EXIT
      );
    }
    process.send({ error: e.message }, EXIT);
  }
  process.send({ triggers });
})();