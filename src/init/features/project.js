"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.doSetup = void 0;
const clc = __importStar(require("colorette"));
const _ = __importStar(require("lodash"));
const error_1 = require("../../error");
const projects_1 = require("../../management/projects");
const logger_1 = require("../../logger");
const utils = __importStar(require("../../utils"));
const prompt = __importStar(require("../../prompt"));
const OPTION_NO_PROJECT = "Don't set up a default project";
const OPTION_USE_PROJECT = "Use an existing project";
const OPTION_NEW_PROJECT = "Create a new project";
const OPTION_ADD_FIREBASE = "Add Firebase to an existing Google Cloud Platform project";
function toInitProjectInfo(projectMetaData) {
    const { projectId, displayName, resources } = projectMetaData;
    return {
        id: projectId,
        label: `${projectId}` + (displayName ? ` (${displayName})` : ""),
        instance: resources?.realtimeDatabaseInstance,
        location: resources?.locationId,
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
    setup.project = {};
    logger_1.logger.info();
    logger_1.logger.info(`First, let's associate this project directory with a Firebase project.`);
    logger_1.logger.info(`You can create multiple project aliases by running ${clc.bold("firebase use --add")}, `);
    logger_1.logger.info(`but for now we'll just set up a default project.`);
    logger_1.logger.info();
    const projectFromRcFile = setup.rcfile?.projects?.default;
    if (projectFromRcFile && !options.project) {
        utils.logBullet(`.firebaserc already has a default project, using ${projectFromRcFile}.`);
        // we still need to get project info in case user wants to init firestore or storage, which
        // require a resource location:
        const rcProject = await (0, projects_1.getFirebaseProject)(projectFromRcFile);
        setup.projectId = rcProject.projectId;
        setup.projectLocation = rcProject?.resources?.locationId;
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
//# sourceMappingURL=project.js.map