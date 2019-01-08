"use strict";

var clc = require("cli-color");
var Command = require("../command");
var FirestoreGet = require("../firestore/get");
var prompt = require("../prompt");
var requirePermissions = require("../requirePermissions");
var utils = require("../utils");

module.exports = new Command("firestore:get [path]")
  .description("Get a document from Cloud Firestore.")
  .option("-y, --yes", "No confirmation. Otherwise, a confirmation prompt will appear.")
  .before(requirePermissions, ["datastore.entities.list", "datastore.entities.get"])
  .action(function(path, options) {
    // Guarantee path
    if (!path && !options.allCollections) {
      return utils.reject("Must specify a path.", { exit: 1 });
    }

    var getOp = new FirestoreGet(options.project, path, {
    });

    var checkPrompt = Promise.resolve({ confirm: true });

    return checkPrompt.then(function(res) {
      if (!res.confirm) {
        return utils.reject("Command aborted.", { exit: 1 });
      }

      if (options.allCollections) {
        return getOp.getDatabase();
      }

      return getOp.execute();
    });
  });
