import * as clc from "cli-color";
import * as _ from "lodash";

import * as firebaseApi from "../../firebaseApi";
import * as logger from "../../logger";
import { FirebaseProject, ProjectInfo } from "../../project";
import { promptOnce, Question } from "../../prompt";
import * as utils from "../../utils";

const NO_PROJECT = "[don't setup a default project]";
const NEW_PROJECT = "[create a new project]";

/**
 * Get the user's desired project, prompting if necessary.
 * Returns a ProjectInfo object:
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
    // tslint:disable-next-line:no-shadowed-variable
    let project: FirebaseProject;
    try {
      project = await firebaseApi.getProject(options.project);
    } catch (e) {
      throw new Error(`Error getting project ${options.project}: ${e}`);
    }
    // tslint:disable-next-line:no-shadowed-variable
    const projectId = project.projectId;
    const name = project.displayName;
    return {
      id: projectId,
      label: projectId + " (" + name + ")",
      instance: _.get(project, "resources.realtimeDatabaseInstance"),
    } as ProjectInfo;
  }

  // Load all projects and prompt the user to choose.
  const projects: FirebaseProject[] = await firebaseApi.listProjects();
  let choices = projects.filter((p: FirebaseProject) => !!p).map((p) => {
    return {
      name: p.projectId + " (" + p.displayName + ")",
      value: p.projectId,
    };
  });
  choices = _.orderBy(choices, ["name"], ["asc"]);
  choices.unshift({ name: NO_PROJECT, value: NO_PROJECT });
  choices.push({ name: NEW_PROJECT, value: NEW_PROJECT });

  if (choices.length >= 25) {
    utils.logBullet(
      "Don't want to scroll through all your projects? If you know your project ID, " +
        "you can initialize it directly using " +
        clc.bold("firebase init --project <project_id>") +
        ".\n"
    );
  }
  const projectId: string = await promptOnce({
    type: "list",
    name: "id",
    message: "Select a default Firebase project for this directory:",
    validate: (answer: any) => {
      if (!_.includes(choices, answer)) {
        return "Must specify a Firebase to which you have access.";
      }
      return true;
    },
    choices,
  } as Question);
  if (projectId === NEW_PROJECT || projectId === NO_PROJECT) {
    return { id: projectId } as ProjectInfo;
  }

  const project = projects.find((p) => p.projectId === projectId);
  const pId = choices.find((p) => p.value === projectId);
  const label = pId ? pId.name : "";

  return {
    id: projectId,
    label,
    instance: _.get(project, "resources.realtimeDatabaseInstance"),
  } as ProjectInfo;
}

export async function doSetup(setup: any, config: any, options: any): Promise<any> {
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

  const projectInfo: ProjectInfo = await getProject(options);
  if (projectInfo.id === NEW_PROJECT) {
    setup.createProject = true;
    return;
  } else if (projectInfo.id === NO_PROJECT) {
    return;
  }

  utils.logBullet("Using project " + projectInfo.label);

  // write "default" alias and activate it immediately
  _.set(setup.rcfile, "projects.default", projectInfo.id);
  setup.projectId = projectInfo.id;
  setup.instance = projectInfo.instance;
  utils.makeActiveProject(config.projectDir, projectInfo.id);
}
