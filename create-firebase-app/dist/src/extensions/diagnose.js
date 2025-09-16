"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diagnose = void 0;
const extensionsHelper_1 = require("./extensionsHelper");
const getProjectNumber_1 = require("../getProjectNumber");
const utils = require("../utils");
const resourceManager = require("../gcp/resourceManager");
const prompt_1 = require("../prompt");
const extensionsApi_1 = require("./extensionsApi");
const logger_1 = require("../logger");
const error_1 = require("../error");
const SERVICE_AGENT_ROLE = "roles/firebasemods.serviceAgent";
/**
 * Diagnoses and optionally fixes known issues with project configuration, ex. missing Extensions Service Agent permissions.
 * @param projectId ID of the project we're querying
 */
async function diagnose(projectId) {
    const projectNumber = await (0, getProjectNumber_1.getProjectNumber)({ projectId });
    const firexSaProjectId = utils.envOverride("FIREBASE_EXTENSIONS_SA_PROJECT_ID", "gcp-sa-firebasemods");
    const saEmail = `service-${projectNumber}@${firexSaProjectId}.iam.gserviceaccount.com`;
    utils.logLabeledBullet(extensionsHelper_1.logPrefix, "Checking project IAM policy...");
    // Call ListExtensionInstances to make sure Extensions Service Agent is provisioned.
    await (0, extensionsApi_1.listInstances)(projectId);
    let policy;
    try {
        policy = await resourceManager.getIamPolicy(projectId);
        logger_1.logger.debug(policy);
    }
    catch (e) {
        if (e instanceof error_1.FirebaseError && e.status === 403) {
            throw new error_1.FirebaseError("Unable to get project IAM policy, permission denied (403). Please " +
                "make sure you have sufficient project privileges or if this is a brand new project " +
                "try again in a few minutes.");
        }
        throw e;
    }
    if (policy.bindings.find((b) => b.role === SERVICE_AGENT_ROLE && b.members.includes("serviceAccount:" + saEmail))) {
        utils.logLabeledSuccess(extensionsHelper_1.logPrefix, "Project IAM policy OK");
        return true;
    }
    else {
        utils.logWarning("Firebase Extensions Service Agent is missing a required IAM role " +
            "`Firebase Extensions API Service Agent`.");
        const fix = await (0, prompt_1.confirm)("Would you like to fix the issue by updating IAM policy to include Firebase " +
            "Extensions Service Agent with role `Firebase Extensions API Service Agent`");
        if (fix) {
            policy.bindings.push({
                role: SERVICE_AGENT_ROLE,
                members: ["serviceAccount:" + saEmail],
            });
            await resourceManager.setIamPolicy(projectId, policy, "bindings");
            utils.logSuccess("Project IAM policy updated successfully");
            return true;
        }
        return false;
    }
}
exports.diagnose = diagnose;
