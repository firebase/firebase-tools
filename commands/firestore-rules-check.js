"use strict";

var Command = require("../lib/command");
var requireAccess = require("../lib/requireAccess");
var scopes = require("../lib/scopes");
var PrepareRules = require("../lib/deploy/firestore/prepare.js");

module.exports = new Command("firestore:rules:check")
  .description("Checks if your firestore rules can compile.")
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(options) {
    return PrepareRules({ firestoreRules: true, firestoreIndexes: false }, options);
  });
