"use strict";

var _ = require("lodash");
var clc = require("cli-color");

var { Command } = require("../command");
var { getFirebaseProject, listFirebaseProjects } = require("../management/projects");
var { prompt } = require("../prompt");
var { requireAuth } = require("../requireAuth");
var { validateProjectId } = require("../command");
var logger = require("../logger");
var utils = require("../utils");

var listAliases = function (options) {
  if (options.rc.hasProjects) {
    logger.info("Project aliases for", clc.bold(options.projectRoot) + ":");
    logger.info();
    _.forEach(options.rc.projects, function (projectId, alias) {
      var listing = alias + " (" + projectId + ")";
      if (options.project === projectId || options.projectAlias === alias) {
        logger.info(clc.cyan.bold("* " + listing));
      } else {
        logger.info("  " + listing);
      }
    });
    logger.info();
  }
  logger.info("Run", clc.bold("firebase use --add"), "to define a new project alias.");
};

var verifyMessage = function (name) {
  return "please verify project " + clc.bold(name) + " exists and you have access.";
};

module.exports = new Command("use [alias_or_project_id]")
  .description("set an active Firebase project for your working directory")
  .option("--add", "create a new project alias interactively")
  .option("--alias <name>", "create a new alias for the provided project id")
  .option("--unalias <name>", "remove an already created project alias")
  .option("--clear", "clear the active project selection")
  .before(requireAuth)
  .action(function (newActive, options) {
    // HACK: Commander.js silently swallows an option called alias >_<
    var aliasOpt;
    var i = process.argv.indexOf("--alias");
    if (i >= 0 && process.argv.length > i + 1) {
      aliasOpt = process.argv[i + 1];
    }

    if (!options.projectRoot) {
      // not in project directory
      return utils.reject(
        clc.bold("firebase use") +
          " must be run from a Firebase project directory.\n\nRun " +
          clc.bold("firebase init") +
          " to start a project directory in the current folder."
      );
    }

    if (newActive) {
      // firebase use [alias_or_project]
      var aliasedProject = options.rc.get(["projects", newActive]);
      var project = null;
      const lookupProject = aliasedProject || newActive;
      validateProjectId(lookupProject);
      return getFirebaseProject(lookupProject)
        .then((foundProject) => {
          project = foundProject;
        })
        .catch(() => {
          return utils.reject("Invalid project selection, " + verifyMessage(newActive));
        })
        .then(() => {
          if (aliasOpt) {
            // firebase use [project] --alias [alias]
            if (!project) {
              return utils.reject(
                "Cannot create alias " + clc.bold(aliasOpt) + ", " + verifyMessage(newActive)
              );
            }
            options.rc.addProjectAlias(aliasOpt, newActive);
            aliasedProject = newActive;
            logger.info("Created alias", clc.bold(aliasOpt), "for", aliasedProject + ".");
          }

          if (aliasedProject) {
            // found alias
            if (!project) {
              // found alias, but not in project list
              return utils.reject(
                "Unable to use alias " + clc.bold(newActive) + ", " + verifyMessage(aliasedProject)
              );
            }

            utils.makeActiveProject(options.projectRoot, newActive);
            logger.info("Now using alias", clc.bold(newActive), "(" + aliasedProject + ")");
          } else if (project) {
            // exact project id specified
            utils.makeActiveProject(options.projectRoot, newActive);
            logger.info("Now using project", clc.bold(newActive));
          } else {
            // no alias or project recognized
            return utils.reject("Invalid project selection, " + verifyMessage(newActive));
          }
        });
    } else if (options.unalias) {
      // firebase use --unalias [alias]
      if (_.has(options.rc.data, ["projects", options.unalias])) {
        options.rc.removeProjectAlias(options.unalias);
        logger.info("Removed alias", clc.bold(options.unalias));
        logger.info();
        listAliases(options);
      }
    } else if (options.add) {
      // firebase use --add
      if (options.nonInteractive) {
        return utils.reject(
          "Cannot run " +
            clc.bold("firebase use --add") +
            " in non-interactive mode. Use " +
            clc.bold("firebase use <project_id> --alias <alias>") +
            " instead."
        );
      }
      return listFirebaseProjects().then(function (projects) {
        var results = {};
        return prompt(results, [
          {
            type: "list",
            name: "project",
            message: "Which project do you want to add?",
            choices: projects.map((p) => p.projectId).sort(),
          },
          {
            type: "input",
            name: "alias",
            message: "What alias do you want to use for this project? (e.g. staging)",
            validate: function (input) {
              return input && input.length > 0;
            },
          },
        ]).then(function () {
          options.rc.addProjectAlias(results.alias, results.project);
          utils.makeActiveProject(options.projectRoot, results.alias);
          logger.info();
          logger.info("Created alias", clc.bold(results.alias), "for", results.project + ".");
          logger.info("Now using alias", clc.bold(results.alias) + " (" + results.project + ")");
        });
      });
    } else if (options.clear) {
      // firebase use --clear
      utils.makeActiveProject(options.projectRoot, null);
      options.projectAlias = null;
      options.project = null;
      logger.info("Cleared active project.");
      logger.info();
      listAliases(options);
    } else {
      // firebase use
      if (options.nonInteractive || !process.stdout.isTTY) {
        if (options.project) {
          logger.info(options.project);
          return options.project;
        }
        return utils.reject("No active project", { exit: 1 });
      }

      if (options.projectAlias) {
        logger.info(
          "Active Project:",
          clc.bold.cyan(options.projectAlias + " (" + options.project + ")")
        );
      } else if (options.project) {
        logger.info("Active Project:", clc.bold.cyan(options.project));
      } else {
        var msg = "No project is currently active";
        if (options.rc.hasProjects) {
          msg += ", and no aliases have been created.";
        }
        logger.info(msg + ".");
      }
      logger.info();
      listAliases(options);
      return options.project;
    }
  });
