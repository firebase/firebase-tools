import * as clc from "cli-color";
import * as _ from "lodash";
import * as util from "util";

import * as firebaseApi from "../../firebaseApi";
import * as logger from "../../logger";
import { Project, ProjectInfo } from "../../project";
import * as prompt from "../../prompt";
import * as utils from "../../utils";

const NO_PROJECT = "[don't setup a default project]";
const NEW_PROJECT = "[create a new project]";

/**
 * Get the user's desired project, prompting if necessary.
 * Returns an object with three fields:
 *
 * {
 *  id: project ID [required]
 *  label: project display label [optional]
 *  instance: project database instance [optional]
 * }
 */
async function getProject(options: any): Promise<ProjectInfo> {
  // The user passed in a --project flag directly, so no need to
  // load all projects.
  if (options.project) {
    return firebaseApi
      .getProject(options.project)
      .then((project: Project) => {
        logger.info(util.inspect(project));
        const projectId = project.projectId;
        const name = project.displayName;
        return {
          id: projectId,
          label: projectId + " (" + name + ")",
          instance: _.get(project, "resources.realtimeDatabaseInstance"),
        } as ProjectInfo;
      })
      .catch((e) => {
        // return utils.reject("Error getting project " + options.project, { original: e });
        throw new Error(`Error getting project ${options.project}: ${e}`);
      });
  }

  // Load all projects and prompt the user to choose.
  return firebaseApi.listProjects().then((projects: Project[]) => {
    let choices = projects.filter((project: Project) => !!project).map((project) => {
      return {
        name: project.projectId,
        label: project.projectId + " (" + project.displayName + ")",
      };
    });
    choices = _.orderBy(choices, ["name"], ["asc"]);
    const nameOptions = [NO_PROJECT].concat(_.map(choices, "label")).concat([NEW_PROJECT]);

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
        validate: (answer: any) => {
          if (!_.includes(nameOptions, answer)) {
            return "Must specify a Firebase to which you have access.";
          }
          return true;
        },
        choices: nameOptions,
      })
      .then((projectLabel: string) => {
        if (projectLabel === NEW_PROJECT || projectLabel === NO_PROJECT) {
          return {
            id: projectLabel,
          } as ProjectInfo;
        }

        const projectId = prompt.listLabelToValue(projectLabel, choices);
        const project = projects.find((p) => p.projectId === projectId);
        return {
          id: projectId,
          label: projectLabel,
          instance: _.get(project, "resources.realtimeDatabaseInstance"),
        } as ProjectInfo;
      });
  });
}

module.exports = (setup: any, config: any, options: any): any => {
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

  return getProject(options).then((project: ProjectInfo) => {
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
