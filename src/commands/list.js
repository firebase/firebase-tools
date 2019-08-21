"use strict";

var Command = require("../command");
var api = require("../api");
var requireAuth = require("../requireAuth");
var clc = require("cli-color");
var Table = require("cli-table");
var _ = require("lodash");
var logger = require("../logger");

/**
 * This command is deprecated in favor of `projects:list` command
 * TODO: Remove this command
 */
module.exports = new Command("list")
  .description("[DEPRECATED: use `projects:list`] list the Firebase projects you have access to")
  .before(requireAuth)
  .action(function(options) {
    logger.warn(
      "This command is deprecated. Instead, use 'firebase projects:list' command to list your projects."
    );
    return api.getProjects().then(function(projects) {
      var tableHead = ["Name", "Project ID / Instance", "Permissions"];
      var table = new Table({
        head: tableHead,
        style: { head: ["yellow"] },
      });

      var out = [];
      _.forEach(projects, function(data, projectId) {
        var project = {
          name: data.name,
          id: projectId,
          permission: data.permission,
          instance: data.instances.database[0],
        };

        var displayId = clc.bold(projectId);
        if (data.instances.database[0] !== projectId) {
          displayId += "\n" + data.instances.database[0] + " (instance)";
        }

        var displayPermission;
        switch (data.permission) {
          case "own":
            displayPermission = clc.cyan.bold("Owner");
            break;
          case "edit":
            displayPermission = clc.bold("Editor");
            break;
          case "view":
          default:
            displayPermission = "Viewer";
        }

        var displayName = data.name;
        if (options.project === projectId) {
          displayName = clc.cyan.bold(displayName + " (current)");
        }

        out.push(project);
        var row = [displayName, displayId, displayPermission];
        table.push(row);
      });

      if (_.size(projects) === 0) {
        logger.info(clc.bold("No projects found."));
        logger.info();
        logger.info(
          clc.bold.cyan("Projects missing?") +
            " This version of the Firebase CLI is only compatible with\n" +
            "projects that have been upgraded to the new Firebase Console. To access your\n" +
            "firebase.com apps, use a previous version: " +
            clc.bold("npm install -g firebase-tools@^2.1")
        );
      } else {
        logger.info(table.toString());
      }
      return out;
    });
  });
