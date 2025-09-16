"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.doSetup = void 0;
const clc = require("colorette");
const _ = require("lodash");
const error_1 = require("../../error");
const projects_1 = require("../../management/projects");
const logger_1 = require("../../logger");
const utils = require("../../utils");
const prompt = require("../../prompt");
const OPTION_NO_PROJECT = "Don't set up a default project";
const OPTION_USE_PROJECT = "Use an existing project";
const OPTION_NEW_PROJECT = "Create a new project";
const OPTION_ADD_FIREBASE = "Add Firebase to an existing Google Cloud Platform project";
function toInitProjectInfo(projectMetaData) {
    const { projectId, displayName, resources } = projectMetaData;
    return {
        id: projectId,
        label: `${projectId}` + (displayName ? ` (${displayName})` : ""),
        instance: resources === null || resources === void 0 ? void 0 : resources.realtimeDatabaseInstance,
        location: resources === null || resources === void 0 ? void 0 : resources.locationId,
    };
}
async function promptAndCreateNewProject(options) {
    utils.logBullet("If you want to create a project in a Google Cloud organization or folder, please use " +
        `"firebase projects:create" instead, and return to this command when you've created the project.`);
    const { projectId, displayName } = await (0, projects_1.promptProjectCreation)(options);
    // N.B. This shouldn't be possible because of the validator on the input field, but it
    // is being left around in case there's something I don't know.
    if (!projectId) {
        throw new error_1.FirebaseError("Project ID cannot be empty");
    }
    return await (0, projects_1.createFirebaseProjectAndLog)(projectId, { displayName });
}
async function promptAndAddFirebaseToCloudProject() {
    const projectId = await (0, projects_1.promptAvailableProjectId)();
    if (!projectId) {
        // N.B. This shouldn't be possible because of the validator on the input field, but it
        // is being left around in case there's something I don't know.
        throw new error_1.FirebaseError("Project ID cannot be empty");
    }
    return await (0, projects_1.addFirebaseToCloudProjectAndLog)(projectId);
}
/**
 * Prompt the user about how they would like to select a project.
 * @param options the Firebase CLI options object.
 * @return the project metadata, or undefined if no project was selected.
 */
async function projectChoicePrompt(options) {
    const choices = [OPTION_USE_PROJECT, OPTION_NEW_PROJECT, OPTION_ADD_FIREBASE, OPTION_NO_PROJECT];
    const projectSetupOption = await prompt.select({
        message: "Please select an option:",
        choices,
    });
    switch (projectSetupOption) {
        case OPTION_USE_PROJECT:
            return (0, projects_1.getOrPromptProject)(options);
        case OPTION_NEW_PROJECT:
            return promptAndCreateNewProject(options);
        case OPTION_ADD_FIREBASE:
            return promptAndAddFirebaseToCloudProject();
        default:
            // Do nothing if user chooses NO_PROJECT
            return;
    }
}
/**
 * Sets up the default project if provided and writes .firebaserc file.
 * @param setup A helper object to use for the rest of the init features.
 * @param config Configuration for the project.
 * @param options Command line options.
 */
async function doSetup(setup, config, options) {
    var _a, _b, _c;
    setup.project = {};
    logger_1.logger.info();
    logger_1.logger.info(`First, let's associate this project directory with a Firebase project.`);
    logger_1.logger.info(`You can create multiple project aliases by running ${clc.bold("firebase use --add")}, `);
    logger_1.logger.info(`but for now we'll just set up a default project.`);
    logger_1.logger.info();
    const projectFromRcFile = (_b = (_a = setup.rcfile) === null || _a === void 0 ? void 0 : _a.projects) === null || _b === void 0 ? void 0 : _b.default;
    if (projectFromRcFile && !options.project) {
        utils.logBullet(`.firebaserc already has a default project, using ${projectFromRcFile}.`);
        // we still need to get project info in case user wants to init firestore or storage, which
        // require a resource location:
        const rcProject = await (0, projects_1.getFirebaseProject)(projectFromRcFile);
        setup.projectId = rcProject.projectId;
        setup.projectLocation = (_c = rcProject === null || rcProject === void 0 ? void 0 : rcProject.resources) === null || _c === void 0 ? void 0 : _c.locationId;
        return;
    }
    let projectMetaData;
    if (options.project) {
        // If the user presented a project with `--project`, try to fetch that project.
        logger_1.logger.debug(`Using project from CLI flag: ${options.project}`);
        projectMetaData = await (0, projects_1.getFirebaseProject)(options.project);
    }
    else {
        const projectEnvVar = utils.envOverride("FIREBASE_PROJECT", "");
        // If env var $FIREBASE_PROJECT is set, try to fetch that project.
        // This is used in some shell scripts e.g. under https://firebase.tools/.
        if (projectEnvVar) {
            logger_1.logger.debug(`Using project from $FIREBASE_PROJECT: ${projectEnvVar}`);
            projectMetaData = await (0, projects_1.getFirebaseProject)(projectEnvVar);
        }
        else {
            if (options.nonInteractive) {
                logger_1.logger.info("No default project found. Continuing without a project in non interactive mode.");
                return;
            }
            projectMetaData = await projectChoicePrompt(options);
            if (!projectMetaData) {
                return;
            }
        }
    }
    const projectInfo = toInitProjectInfo(projectMetaData);
    utils.logBullet(`Using project ${projectInfo.label}`);
    // write "default" alias and activate it immediately
    _.set(setup.rcfile, "projects.default", projectInfo.id);
    setup.projectId = projectInfo.id;
    setup.instance = projectInfo.instance;
    setup.projectLocation = projectInfo.location;
    utils.makeActiveProject(config.projectDir, projectInfo.id);
}
exports.doSetup = doSetup;
