"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.displayDeveloperTOSWarning = exports.acceptLatestAppDeveloperTOS = exports.acceptLatestPublisherTOS = exports.acceptPublisherTOS = exports.getPublisherTOSStatus = exports.acceptAppDeveloperTOS = exports.getAppDeveloperTOSStatus = void 0;
const apiv2_1 = require("../apiv2");
const api_1 = require("../api");
const logger_1 = require("../logger");
const prompt_1 = require("../prompt");
const error_1 = require("../error");
const extensionsHelper_1 = require("./extensionsHelper");
const utils = require("../utils");
const VERSION = "v1";
const extensionsTosUrl = (tos) => `https://firebase.google.com/terms/extensions/${tos}`;
const apiClient = new apiv2_1.Client({ urlPrefix: (0, api_1.extensionsTOSOrigin)(), apiVersion: VERSION });
async function getAppDeveloperTOSStatus(projectId) {
    const res = await apiClient.get(`/projects/${projectId}/appdevtos`);
    return res.body;
}
exports.getAppDeveloperTOSStatus = getAppDeveloperTOSStatus;
async function acceptAppDeveloperTOS(projectId, tosVersion, instanceId = "") {
    const res = await apiClient.post(`/projects/${projectId}/appdevtos:accept`, {
        name: `project/${projectId}/appdevtos`,
        instanceId,
        version: tosVersion,
    });
    return res.body;
}
exports.acceptAppDeveloperTOS = acceptAppDeveloperTOS;
async function getPublisherTOSStatus(projectId) {
    const res = await apiClient.get(`/projects/${projectId}/publishertos`);
    return res.body;
}
exports.getPublisherTOSStatus = getPublisherTOSStatus;
async function acceptPublisherTOS(projectId, tosVersion) {
    const res = await apiClient.post(`/projects/${projectId}/publishertos:accept`, {
        name: `project/${projectId}/publishertos`,
        version: tosVersion,
    });
    return res.body;
}
exports.acceptPublisherTOS = acceptPublisherTOS;
async function acceptLatestPublisherTOS(options, projectId) {
    try {
        logger_1.logger.debug(`Checking if latest publisher TOS has been accepted by ${projectId}...`);
        const currentAcceptance = await getPublisherTOSStatus(projectId);
        if (currentAcceptance.lastAcceptedVersion) {
            logger_1.logger.debug(`Already accepted version ${currentAcceptance.lastAcceptedVersion} of Extensions publisher TOS.`);
            return currentAcceptance;
        }
        else {
            // Display link to TOS, prompt for acceptance
            const tosLink = extensionsTosUrl("publisher");
            logger_1.logger.info(`To continue, you must accept the Firebase Extensions Publisher Terms of Service: ${tosLink}`);
            if (await (0, prompt_1.confirm)({
                message: "Do you accept the Firebase Extensions Publisher Terms of Service?",
                nonInteractive: options.nonInteractive,
                force: options.force,
            })) {
                return acceptPublisherTOS(projectId, currentAcceptance.latestTosVersion);
            }
        }
    }
    catch (err) {
        // This is a best effort check. When authenticated via a service account instead of OAuth, we cannot
        // make calls to a private API. The extensions backend will also check TOS acceptance at instance CRUD time.
        logger_1.logger.debug(`Error when checking Publisher TOS for ${projectId}. This is expected if authenticated via a service account: ${err}`);
        return;
    }
    throw new error_1.FirebaseError("You must accept the terms of service to continue.");
}
exports.acceptLatestPublisherTOS = acceptLatestPublisherTOS;
async function acceptLatestAppDeveloperTOS(options, projectId, instanceIds) {
    try {
        logger_1.logger.debug(`Checking if latest AppDeveloper TOS has been accepted by ${projectId}...`);
        displayDeveloperTOSWarning();
        const currentAcceptance = await getAppDeveloperTOSStatus(projectId);
        if (currentAcceptance.lastAcceptedVersion) {
            logger_1.logger.debug(`User Terms of Service aready accepted on project ${projectId}.`);
        }
        else if (!(await (0, prompt_1.confirm)({
            message: "Do you accept the Firebase Extensions User Terms of Service?",
            nonInteractive: options.nonInteractive,
            force: options.force,
        }))) {
            throw new error_1.FirebaseError("You must accept the terms of service to continue.");
        }
        const tosPromises = instanceIds.map((instanceId) => {
            return acceptAppDeveloperTOS(projectId, currentAcceptance.latestTosVersion, instanceId);
        });
        return Promise.all(tosPromises);
    }
    catch (err) {
        // This is a best effort check. When authenticated via a service account instead of OAuth, we cannot
        // make calls to a private API. The extensions backend will also check TOS acceptance at instance CRUD time.
        logger_1.logger.debug(`Error when checking App Developer TOS for ${projectId}. This is expected if authenticated via a service account: ${err}`);
        return [];
    }
}
exports.acceptLatestAppDeveloperTOS = acceptLatestAppDeveloperTOS;
function displayDeveloperTOSWarning() {
    const tosLink = extensionsTosUrl("user");
    utils.logLabeledBullet(extensionsHelper_1.logPrefix, `By installing an extension instance onto a Firebase project, you accept the Firebase Extensions User Terms of Service: ${tosLink}`);
}
exports.displayDeveloperTOSWarning = displayDeveloperTOSWarning;
