"use strict";

var clc = require("cli-color");

var _ = require("lodash");
var api = require("../../api");
var prompt = require("../../prompt");
var logger = require("../../logger");
var utils = require("../../utils");

var NO_PROJECT = "[don't setup a default project]";
var NEW_PROJECT = "[create a new project]";

/**
 * Get the user's desired project, prompting if necessary.
 * Returns an object with three fields:
 *
 * {
 *  id: project ID [required]
 *  name: project display name [optional]
 *  instance: project database instance [optional]
 * }
 */
function _getProject(options) {
  // The user passed in a --project flag directly, so no need to
  // load all projects.
  if (options.project) {
    return api
      .request("GET", "/v1beta1/projects/" + options.project, {
        auth: true,
        origin: api.firebaseApiOrigin,
      })
      .then(function(response) {
        var id = response.body.projectId;
        var name = response.body.displayName;
        return {
          id: id,
          label: id + " (" + name + ")",
          instance: response.body.resources.realtimeDatabaseInstance,
        };
      })
      .catch(function(e) {
        return utils.reject("Error getting project " + options.project, { original: e });
      });
  }

  // Load all projects and prompt the user to choose.
  return api.getProjects().then(function(projects) {
    var choices = _.map(projects, function(info, projectId) {
      return {
        name: projectId,
        label: projectId + " (" + info.name + ")",
      };
    });
    choices = _.orderBy(choices, ["name"], ["asc"]);
    var nameOptions = [NO_PROJECT].concat(_.map(choices, "label")).concat([NEW_PROJECT]);

    if (choices.length >= 25) {
      utils.logBullet(
        "Don't want to scroll through all your projects? If you know your project ID, " +
          "you can initialize it directly using " +
          clc.bold("firebase init --project <project_id>") +
          ".\n"
      );
    }

    return prompt
      .once({
        type: "list",
        name: "id",
        message: "Select a default Firebase project for this directory:",
        validate: function(answer) {
          if (!_.includes(nameOptions, answer)) {
            return "Must specify a Firebase to which you have access.";
          }
          return true;
        },
        choices: nameOptions,
      })
      .then(function(label) {
        if (label === NEW_PROJECT || label === NO_PROJECT) {
          return {
            id: label,
          };
        }

        var id = prompt.listLabelToValue(label, choices);
        return {
          id: id,
          label: label,
          instance: projects[id].instances.database[0],
        };
      });
  });
}

module.exports = function(setup, config, options) {
  setup.project = {};

  logger.info();
  logger.info("First, let's associate this project directory with a Firebase project.");
  logger.info(
    "You can create multiple project aliases by running " + clc.bold("firebase use --add") + ", "
  );
  logger.info("but for now we'll just set up a default project.");
  logger.info();

  if (_.has(setup.rcfile, "projects.default")) {
    utils.logBullet(".firebaserc already has a default project, skipping");
    setup.projectId = _.get(setup.rcfile, "projects.default");
    return undefined;
  }

  return _getProject(options).then(function(project) {
    if (project.id === NEW_PROJECT) {
      setup.createProject = true;
      return;
    } else if (project.id === NO_PROJECT) {
      return;
    }

    utils.logBullet("Using project " + project.label);

    // write "default" alias and activate it immediately
    _.set(setup.rcfile, "projects.default", project.id);
    setup.projectId = project.id;
    setup.instance = project.instance;
    utils.makeActiveProject(config.projectDir, project.id);
  });
};
