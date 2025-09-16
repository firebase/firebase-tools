"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkFirebaseEnabledForCloudProject = exports.getProject = exports.getFirebaseProject = exports.checkAndRecommendProjectId = exports.listFirebaseProjects = exports.getAvailableCloudProjectPage = exports.getFirebaseProjectPage = exports.addFirebaseToCloudProject = exports.createCloudProject = exports.promptAvailableProjectId = exports.getOrPromptProject = exports.addFirebaseToCloudProjectAndLog = exports.createFirebaseProjectAndLog = exports.promptProjectCreation = exports.ProjectParentResourceType = void 0;
const clc = require("colorette");
const ora = require("ora");
const apiv2_1 = require("../apiv2");
const error_1 = require("../error");
const operation_poller_1 = require("../operation-poller");
const prompt = require("../prompt");
const api = require("../api");
const logger_1 = require("../logger");
const utils = require("../utils");
const ensureApiEnabled_1 = require("../ensureApiEnabled");
const TIMEOUT_MILLIS = 30000;
const MAXIMUM_PROMPT_LIST = 100;
const PROJECT_LIST_PAGE_SIZE = 1000;
const CREATE_PROJECT_API_REQUEST_TIMEOUT_MILLIS = 15000;
const CHECK_PROJECT_ID_API_REQUEST_TIMEOUT_MILLIS = 15000;
var ProjectParentResourceType;
(function (ProjectParentResourceType) {
    ProjectParentResourceType["ORGANIZATION"] = "organization";
    ProjectParentResourceType["FOLDER"] = "folder";
})(ProjectParentResourceType = exports.ProjectParentResourceType || (exports.ProjectParentResourceType = {}));
/**
 * Prompt user to create a new project
 */
async function promptProjectCreation(options) {
    var _a, _b;
    const projectId = (_a = options.projectId) !== null && _a !== void 0 ? _a : (await prompt.input({
        message: "Please specify a unique project id " +
            `(${clc.yellow("warning")}: cannot be modified afterward) [6-30 characters]:\n`,
        validate: async (projectId) => {
            if (projectId.length < 6) {
                return "Project ID must be at least 6 characters long";
            }
            else if (projectId.length > 30) {
                return "Project ID cannot be longer than 30 characters";
            }
            try {
                // Best effort. We should still allow project creation even if this fails.
                const { isAvailable, suggestedProjectId } = await checkAndRecommendProjectId(projectId);
                if (!isAvailable && suggestedProjectId) {
                    return `Project ID is taken or unavailable. Try ${clc.bold(suggestedProjectId)}.`;
                }
            }
            catch (error) {
                logger_1.logger.debug(`Couldn't check if project ID ${projectId} is available. Original error: ${error}`);
            }
            return true;
        },
    }));
    const displayName = (_b = options.displayName) !== null && _b !== void 0 ? _b : (await prompt.input({
        default: projectId,
        message: "What would you like to call your project? (defaults to your project ID)",
        validate: (displayName) => {
            if (displayName.length < 4) {
                return "Project name must be at least 4 characters long";
            }
            else if (displayName.length > 30) {
                return "Project name cannot be longer than 30 characters";
            }
            else {
                return true;
            }
        },
    }));
    return { projectId, displayName };
}
exports.promptProjectCreation = promptProjectCreation;
const firebaseAPIClient = new apiv2_1.Client({
    urlPrefix: api.firebaseApiOrigin(),
    auth: true,
    apiVersion: "v1beta1",
});
const firebaseV1APIClient = new apiv2_1.Client({
    urlPrefix: api.firebaseApiOrigin(),
    auth: true,
    apiVersion: "v1",
});
const resourceManagerClient = new apiv2_1.Client({
    urlPrefix: api.resourceManagerOrigin(),
    apiVersion: "v1",
});
/**
 * Create a new Google Cloud Platform project and add Firebase resources to it
 */
async function createFirebaseProjectAndLog(projectId, options) {
    const spinner = ora("Creating Google Cloud Platform project").start();
    try {
        await createCloudProject(projectId, options);
        spinner.succeed();
    }
    catch (err) {
        spinner.fail();
        throw err;
    }
    return addFirebaseToCloudProjectAndLog(projectId);
}
exports.createFirebaseProjectAndLog = createFirebaseProjectAndLog;
/**
 * Add Firebase resources to a Google Cloud Platform project
 */
async function addFirebaseToCloudProjectAndLog(projectId) {
    let projectInfo;
    const spinner = ora("Adding Firebase resources to Google Cloud Platform project").start();
    try {
        projectInfo = await addFirebaseToCloudProject(projectId);
    }
    catch (err) {
        spinner.fail();
        throw err;
    }
    spinner.succeed();
    logNewFirebaseProjectInfo(projectInfo);
    return projectInfo;
}
exports.addFirebaseToCloudProjectAndLog = addFirebaseToCloudProjectAndLog;
function logNewFirebaseProjectInfo(projectInfo) {
    logger_1.logger.info("");
    if (process.platform === "win32") {
        logger_1.logger.info("=== Your Firebase project is ready! ===");
    }
    else {
        logger_1.logger.info("🎉🎉🎉 Your Firebase project is ready! 🎉🎉🎉");
    }
    logger_1.logger.info("");
    logger_1.logger.info("Project information:");
    logger_1.logger.info(`   - Project ID: ${clc.bold(projectInfo.projectId)}`);
    if (projectInfo.displayName) {
        logger_1.logger.info(`   - Project Name: ${clc.bold(projectInfo.displayName)}`);
    }
    logger_1.logger.info("");
    logger_1.logger.info("Firebase console is available at");
    logger_1.logger.info(`https://console.firebase.google.com/project/${clc.bold(projectInfo.projectId)}/overview`);
}
/**
 * Get the user's desired project, prompting if necessary.
 */
async function getOrPromptProject(options) {
    if (options.project) {
        return await getFirebaseProject(options.project);
    }
    return selectProjectInteractively();
}
exports.getOrPromptProject = getOrPromptProject;
async function selectProjectInteractively(pageSize = MAXIMUM_PROMPT_LIST) {
    const { projects, nextPageToken } = await getFirebaseProjectPage(pageSize);
    if (projects.length === 0) {
        throw new error_1.FirebaseError("There are no Firebase projects associated with this account.");
    }
    if (nextPageToken) {
        // Prompt user for project ID if we can't list all projects in 1 page
        logger_1.logger.debug(`Found more than ${projects.length} projects, selecting via prompt`);
        return selectProjectByPrompting();
    }
    return selectProjectFromList(projects);
}
async function selectProjectByPrompting() {
    const projectId = await prompt.input("Please input the project ID you would like to use:");
    return await getFirebaseProject(projectId);
}
/**
 * Presents user with list of projects to choose from and gets project information for chosen project.
 */
async function selectProjectFromList(projects = []) {
    const choices = projects
        .filter((p) => !!p)
        .map((p) => {
        return {
            name: p.projectId + (p.displayName ? ` (${p.displayName})` : ""),
            value: p.projectId,
        };
    })
        .sort((a, b) => a.name.localeCompare(b.name));
    if (choices.length >= 25) {
        utils.logBullet(`Don't want to scroll through all your projects? If you know your project ID, ` +
            `you can initialize it directly using ${clc.bold("firebase init --project <project_id>")}.\n`);
    }
    const projectId = await prompt.select({
        message: "Select a default Firebase project for this directory:",
        choices,
    });
    const project = projects.find((p) => p.projectId === projectId);
    if (!project) {
        throw new error_1.FirebaseError("Unexpected error. Project does not exist");
    }
    return project;
}
function getProjectId(cloudProject) {
    const resourceName = cloudProject.project;
    // According to
    // https://firebase.google.com/docs/projects/api/reference/rest/v1beta1/availableProjects/list#projectinfo,
    // resource name has the format of "projects/projectId"
    return resourceName.substring(resourceName.lastIndexOf("/") + 1);
}
/**
 * Prompt user to select an available GCP project to add Firebase resources
 */
async function promptAvailableProjectId() {
    const { projects, nextPageToken } = await getAvailableCloudProjectPage(MAXIMUM_PROMPT_LIST);
    if (projects.length === 0) {
        throw new error_1.FirebaseError("There are no available Google Cloud projects to add Firebase services.");
    }
    if (nextPageToken) {
        // Prompt for project ID if we can't list all projects in 1 page
        return await prompt.input("Please input the ID of the Google Cloud Project you would like to add Firebase:");
    }
    else {
        const choices = projects
            .filter((p) => !!p)
            .map((p) => {
            const projectId = getProjectId(p);
            return {
                name: projectId + (p.displayName ? ` (${p.displayName})` : ""),
                value: projectId,
            };
        })
            .sort((a, b) => a.name.localeCompare(b.name));
        return await prompt.select({
            message: "Select the Google Cloud Platform project you would like to add Firebase:",
            choices,
        });
    }
}
exports.promptAvailableProjectId = promptAvailableProjectId;
/**
 * Send an API request to create a new Google Cloud Platform project and poll the LRO to get the
 * new project information.
 * @return a promise that resolves to the new cloud project information
 */
async function createCloudProject(projectId, options) {
    try {
        const data = {
            projectId,
            name: options.displayName || projectId,
            parent: options.parentResource,
        };
        const response = await resourceManagerClient.request({
            method: "POST",
            path: "/projects",
            body: data,
            timeout: CREATE_PROJECT_API_REQUEST_TIMEOUT_MILLIS,
        });
        const projectInfo = await (0, operation_poller_1.pollOperation)({
            pollerName: "Project Creation Poller",
            apiOrigin: api.resourceManagerOrigin(),
            apiVersion: "v1",
            operationResourceName: response.body.name /* LRO resource name */,
        });
        return projectInfo;
    }
    catch (err) {
        if (err.status === 409) {
            throw new error_1.FirebaseError(`Failed to create project because there is already a project with ID ${clc.bold(projectId)}. Please try again with a unique project ID.`, {
                exit: 2,
                original: err,
            });
        }
        else {
            throw new error_1.FirebaseError("Failed to create project. See firebase-debug.log for more info.", {
                exit: 2,
                original: err,
            });
        }
    }
}
exports.createCloudProject = createCloudProject;
/**
 * Send an API request to add Firebase to the Google Cloud Platform project and poll the LRO
 * to get the new Firebase project information.
 * @return a promise that resolves to the new firebase project information
 */
async function addFirebaseToCloudProject(projectId) {
    try {
        const response = await firebaseAPIClient.request({
            method: "POST",
            path: `/projects/${projectId}:addFirebase`,
            timeout: CREATE_PROJECT_API_REQUEST_TIMEOUT_MILLIS,
        });
        const projectInfo = await (0, operation_poller_1.pollOperation)({
            pollerName: "Add Firebase Poller",
            apiOrigin: api.firebaseApiOrigin(),
            apiVersion: "v1beta1",
            operationResourceName: response.body.name /* LRO resource name */,
        });
        return projectInfo;
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        throw new error_1.FirebaseError("Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info.", { exit: 2, original: err });
    }
}
exports.addFirebaseToCloudProject = addFirebaseToCloudProject;
async function getProjectPage(apiResource, options) {
    const queryParams = {
        pageSize: `${options.pageSize}`,
    };
    if (options.pageToken) {
        queryParams.pageToken = options.pageToken;
    }
    const res = await firebaseAPIClient.request({
        method: "GET",
        path: apiResource,
        queryParams,
        timeout: TIMEOUT_MILLIS,
        skipLog: { resBody: true },
    });
    const projects = res.body[options.responseKey];
    const token = res.body.nextPageToken;
    return {
        projects: Array.isArray(projects) ? projects : [],
        nextPageToken: typeof token === "string" ? token : undefined,
    };
}
/**
 * Lists Firebase projects in a page using the paginated API, identified by the page token and its
 * size.
 */
async function getFirebaseProjectPage(pageSize = PROJECT_LIST_PAGE_SIZE, pageToken) {
    let projectPage;
    try {
        projectPage = await getProjectPage("/projects", {
            responseKey: "results",
            pageSize,
            pageToken,
        });
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        throw new error_1.FirebaseError("Failed to list Firebase projects. See firebase-debug.log for more info.", { exit: 2, original: err });
    }
    return projectPage;
}
exports.getFirebaseProjectPage = getFirebaseProjectPage;
/**
 * Lists a page of available Google Cloud Platform projects that are available to have Firebase
 * resources added, using the paginated API, identified by the page token and its size.
 */
async function getAvailableCloudProjectPage(pageSize = PROJECT_LIST_PAGE_SIZE, pageToken) {
    try {
        return await getProjectPage("/availableProjects", {
            responseKey: "projectInfo",
            pageSize,
            pageToken,
        });
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        throw new error_1.FirebaseError("Failed to list available Google Cloud Platform projects. See firebase-debug.log for more info.", { exit: 2, original: err });
    }
}
exports.getAvailableCloudProjectPage = getAvailableCloudProjectPage;
/**
 * Lists all Firebase projects associated with the currently logged-in account. Repeatedly calls the
 * paginated API until all pages have been read.
 * @return a promise that resolves to the list of all projects.
 */
async function listFirebaseProjects(pageSize) {
    const projects = [];
    let nextPageToken;
    do {
        const projectPage = await getFirebaseProjectPage(pageSize, nextPageToken);
        projects.push(...projectPage.projects);
        nextPageToken = projectPage.nextPageToken;
    } while (nextPageToken);
    return projects;
}
exports.listFirebaseProjects = listFirebaseProjects;
async function checkAndRecommendProjectId(projectId) {
    try {
        const res = await firebaseV1APIClient.request({
            method: "POST",
            path: "/projects:checkProjectId",
            body: {
                proposedId: projectId,
            },
            timeout: CHECK_PROJECT_ID_API_REQUEST_TIMEOUT_MILLIS,
        });
        const { projectIdStatus, suggestedProjectId } = res.body;
        return {
            isAvailable: projectIdStatus === "PROJECT_ID_AVAILABLE",
            suggestedProjectId,
        };
    }
    catch (err) {
        throw new error_1.FirebaseError("Failed to check if project ID is available. See firebase-debug.log for more info.", { exit: 2, original: err });
    }
}
exports.checkAndRecommendProjectId = checkAndRecommendProjectId;
/**
 * Gets the Firebase project information identified by the specified project ID
 */
async function getFirebaseProject(projectId) {
    try {
        const res = await firebaseAPIClient.request({
            method: "GET",
            path: `/projects/${projectId}`,
            timeout: TIMEOUT_MILLIS,
        });
        return res.body;
    }
    catch (err) {
        if ((0, error_1.getErrStatus)(err) === 404) {
            try {
                logger_1.logger.debug(`Couldn't get project info from firedata for ${projectId}, trying resource manager. Original error: ${err}`);
                const info = await getProject(projectId);
                // TODO: Update copy based on Rachel/Yvonne's feedback.
                // TODO: Add link
                // logger.info(`Project ${clc.bold(projectId)} is not a Firebase project.`);
                // logger.info('It can only use products governed by the Google Cloud Platform terms of service.');
                // logger.info('If you wish to use products governed by the Firebase terms of service, upgrade to a Firebase project <link here>');
                return info;
            }
            catch (err) {
                logger_1.logger.debug(`Unable to get project info from resourcemanager for ${projectId}: ${err}`);
            }
        }
        let message = err.message;
        if (err.original) {
            message += ` (original: ${err.original.message})`;
        }
        logger_1.logger.debug(message);
        throw new error_1.FirebaseError(`Failed to get Firebase project ${projectId}. ` +
            "Please make sure the project exists and your account has permission to access it.", { exit: 2, original: err });
    }
}
exports.getFirebaseProject = getFirebaseProject;
/**
 * Gets basic information about any Cloud project. Does not use Firebase TOS APIs, so this is safe for core app projects.
 * @param projectId
 */
async function getProject(projectId) {
    await (0, ensureApiEnabled_1.bestEffortEnsure)(projectId, api.resourceManagerOrigin(), "firebase", true);
    const response = await resourceManagerClient.get(`/projects/${projectId}`);
    return response.body;
}
exports.getProject = getProject;
/**
 * Checks if Firebase services are enabled for a Google Cloud Platform project.
 * @param projectId The project ID to check
 * @return A promise that resolves to the Firebase project metadata if enabled, undefined otherwise
 */
async function checkFirebaseEnabledForCloudProject(projectId) {
    try {
        const res = await firebaseAPIClient.request({
            method: "GET",
            path: `/projects/${projectId}`,
            timeout: TIMEOUT_MILLIS,
        });
        return res.body;
    }
    catch (err) {
        if ((0, error_1.getErrStatus)(err) === 404) {
            // 404 means Firebase is not enabled for this project
            return undefined;
        }
        let message = err.message;
        if (err.original) {
            message += ` (original: ${err.original.message})`;
        }
        logger_1.logger.debug(message);
        throw new error_1.FirebaseError(`Failed to check if Firebase is enabled for project ${projectId}. ` +
            "Please make sure the project exists and your account has permission to access it.", { exit: 2, original: err });
    }
}
exports.checkFirebaseEnabledForCloudProject = checkFirebaseEnabledForCloudProject;
