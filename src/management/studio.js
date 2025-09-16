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
exports.updateStudioFirebaseProject = exports.reconcileStudioFirebaseProject = void 0;
const apiv2_1 = require("../apiv2");
const prompt = __importStar(require("../prompt"));
const api = __importStar(require("../api"));
const logger_1 = require("../logger");
const utils = __importStar(require("../utils"));
const configstore_1 = require("../configstore");
const TIMEOUT_MILLIS = 30000;
const studioClient = new apiv2_1.Client({
    urlPrefix: api.studioApiOrigin(),
    apiVersion: "v1",
});
/**
 * Reconciles the active project in your Studio Workspace when running the CLI
 * in Firebase Studio.
 * @param activeProjectFromConfig The project ID saved in configstore
 * @return A promise that resolves with the reconciled active project
 */
async function reconcileStudioFirebaseProject(options, activeProjectFromConfig) {
    const studioWorkspace = await getStudioWorkspace();
    // Fail gracefully and resolve with the existing configs
    if (!studioWorkspace) {
        return activeProjectFromConfig;
    }
    // If Studio has no project, update Studio if the CLI has one
    if (!studioWorkspace.firebaseProjectId) {
        if (activeProjectFromConfig) {
            await updateStudioFirebaseProject(activeProjectFromConfig);
        }
        return activeProjectFromConfig;
    }
    // If the CLI has no project, update the CLI with what Studio has
    if (!activeProjectFromConfig) {
        await writeStudioProjectToConfigStore(options, studioWorkspace.firebaseProjectId);
        return studioWorkspace.firebaseProjectId;
    }
    // If both have an active project, allow the user to choose
    if (studioWorkspace.firebaseProjectId !== activeProjectFromConfig && !options.nonInteractive) {
        const choices = [
            {
                name: `Set ${studioWorkspace.firebaseProjectId} from Firebase Studio as my active project in both places`,
                value: false,
            },
            {
                name: `Set ${activeProjectFromConfig} from Firebase CLI as my active project in both places`,
                value: true,
            },
        ];
        const useCliProject = await prompt.select({
            message: "Found different active Firebase Projects in the Firebase CLI and your Firebase Studio Workspace. Which project would you like to set as your active project?",
            choices,
        });
        if (useCliProject) {
            await updateStudioFirebaseProject(activeProjectFromConfig);
            return activeProjectFromConfig;
        }
        else {
            await writeStudioProjectToConfigStore(options, studioWorkspace.firebaseProjectId);
            return studioWorkspace.firebaseProjectId;
        }
    }
    // Otherwise, Studio and the CLI agree
    return studioWorkspace.firebaseProjectId;
}
exports.reconcileStudioFirebaseProject = reconcileStudioFirebaseProject;
async function getStudioWorkspace() {
    const workspaceId = process.env.WORKSPACE_SLUG;
    if (!workspaceId) {
        logger_1.logger.error(`Failed to fetch Firebase Project from Studio Workspace because WORKSPACE_SLUG environment variable is empty`);
        return undefined;
    }
    try {
        const res = await studioClient.request({
            method: "GET",
            path: `/workspaces/${workspaceId}`,
            timeout: TIMEOUT_MILLIS,
        });
        return res.body;
    }
    catch (err) {
        let message = err.message;
        if (err.original) {
            message += ` (original: ${err.original.message})`;
        }
        logger_1.logger.error(`Failed to fetch Firebase Project from current Studio Workspace: ${message}`);
        // We're going to fail gracefully so that the caller can handle the error
        return undefined;
    }
}
async function writeStudioProjectToConfigStore(options, studioProjectId) {
    if (options.projectRoot) {
        logger_1.logger.info(`Updating Firebase CLI active project to match Studio Workspace '${studioProjectId}'`);
        utils.makeActiveProject(options.projectRoot, studioProjectId);
        recordStudioProjectSyncTime();
    }
}
/**
 * Sets the active project for the current Firebase Studio Workspace
 * @param projectId The project ID saved in spanner
 * @return A promise that resolves when complete
 */
async function updateStudioFirebaseProject(projectId) {
    logger_1.logger.info(`Updating Studio Workspace active project to match Firebase CLI '${projectId}'`);
    const workspaceId = process.env.WORKSPACE_SLUG;
    if (!workspaceId) {
        logger_1.logger.error(`Failed to update Firebase Project for Studio Workspace because WORKSPACE_SLUG environment variable is empty`);
        return;
    }
    try {
        await studioClient.request({
            method: "PATCH",
            path: `/workspaces/${workspaceId}`,
            responseType: "json",
            body: {
                firebaseProjectId: projectId,
            },
            queryParams: {
                updateMask: "workspace.firebaseProjectId",
            },
            timeout: TIMEOUT_MILLIS,
        });
    }
    catch (err) {
        let message = err.message;
        if (err.original) {
            message += ` (original: ${err.original.message})`;
        }
        logger_1.logger.debug(`Failed to update active Firebase Project for current Studio Workspace: ${message}`);
    }
    recordStudioProjectSyncTime();
}
exports.updateStudioFirebaseProject = updateStudioFirebaseProject;
/**
 * Records the last time we synced the Studio project in Configstore.
 * This is important to trigger a file watcher in Firebase Studio that keeps the UI in sync.
 */
function recordStudioProjectSyncTime() {
    configstore_1.configstore.set("firebaseStudioProjectLastSynced", Date.now());
}
//# sourceMappingURL=studio.js.map