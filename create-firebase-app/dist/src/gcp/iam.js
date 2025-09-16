"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printManualIamConfig = exports.mergeBindings = exports.testIamPermissions = exports.testResourceIamPermissions = exports.getRole = exports.listServiceAccountKeys = exports.deleteServiceAccount = exports.createServiceAccountKey = exports.getServiceAccount = exports.createServiceAccount = exports.getDefaultCloudBuildServiceAgent = void 0;
const api_1 = require("../api");
const logger_1 = require("../logger");
const apiv2_1 = require("../apiv2");
const utils = require("../utils");
const apiClient = new apiv2_1.Client({ urlPrefix: (0, api_1.iamOrigin)(), apiVersion: "v1" });
/** Returns the default cloud build service agent */
function getDefaultCloudBuildServiceAgent(projectNumber) {
    return `${projectNumber}@cloudbuild.gserviceaccount.com`;
}
exports.getDefaultCloudBuildServiceAgent = getDefaultCloudBuildServiceAgent;
/**
 * Creates a new the service account with the given parameters.
 * @param projectId the id of the project where the service account will be created
 * @param accountId the id to use for the account
 * @param description a brief description of the account
 * @param displayName a user-friendly name to be displayed on the console
 */
async function createServiceAccount(projectId, accountId, description, displayName) {
    const response = await apiClient.post(`/projects/${projectId}/serviceAccounts`, {
        accountId,
        serviceAccount: {
            displayName,
            description,
        },
    }, { skipLog: { resBody: true } });
    return response.body;
}
exports.createServiceAccount = createServiceAccount;
/**
 * Retrieves a service account with the given parameters.
 * @param projectId the id of the project where the service account will be created
 * @param serviceAccountName the name of the service account
 */
async function getServiceAccount(projectId, serviceAccountName) {
    const response = await apiClient.get(`/projects/${projectId}/serviceAccounts/${serviceAccountName}@${projectId}.iam.gserviceaccount.com`);
    return response.body;
}
exports.getServiceAccount = getServiceAccount;
/**
 * Creates a key for a given service account.
 */
async function createServiceAccountKey(projectId, serviceAccountName) {
    const response = await apiClient.post(`/projects/${projectId}/serviceAccounts/${serviceAccountName}@${projectId}.iam.gserviceaccount.com/keys`, {
        keyAlgorithm: "KEY_ALG_UNSPECIFIED",
        privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE",
    });
    return response.body;
}
exports.createServiceAccountKey = createServiceAccountKey;
/**
 * @param projectId the id of the project containing the service account
 * @param accountEmail the email of the service account to delete
 */
async function deleteServiceAccount(projectId, accountEmail) {
    await apiClient.delete(`/projects/${projectId}/serviceAccounts/${accountEmail}`, {
        resolveOnHTTPError: true,
    });
}
exports.deleteServiceAccount = deleteServiceAccount;
/**
 * Lists every key for a given service account.
 */
async function listServiceAccountKeys(projectId, serviceAccountName) {
    const response = await apiClient.get(`/projects/${projectId}/serviceAccounts/${serviceAccountName}@${projectId}.iam.gserviceaccount.com/keys`);
    return response.body.keys;
}
exports.listServiceAccountKeys = listServiceAccountKeys;
/**
 * Given a name, returns corresponding Role, see
 * https://cloud.google.com/iam/reference/rest/v1/organizations.roles#Role
 * for more details.
 * @param role The IAM role to get, e.g. "editor".
 * @return Details about the IAM role.
 */
async function getRole(role) {
    const response = await apiClient.get(`/roles/${role}`, {
        retryCodes: [500, 503],
    });
    return response.body;
}
exports.getRole = getRole;
/**
 * List permissions not held by an arbitrary resource implementing the IAM APIs.
 * @param origin Resource origin e.g. `https:// iam.googleapis.com`.
 * @param apiVersion API version e.g. `v1`.
 * @param resourceName Resource name e.g. `projects/my-projct/widgets/abc`
 * @param permissions An array of string permissions, e.g. `["iam.serviceAccounts.actAs"]`
 */
async function testResourceIamPermissions(origin, apiVersion, resourceName, permissions, quotaUser = "") {
    const localClient = new apiv2_1.Client({ urlPrefix: origin, apiVersion });
    if (process.env.FIREBASE_SKIP_INFORMATIONAL_IAM) {
        logger_1.logger.debug(`[iam] skipping informational check of permissions ${JSON.stringify(permissions)} on resource ${resourceName}`);
        return { allowed: Array.from(permissions).sort(), missing: [], passed: true };
    }
    const headers = {};
    if (quotaUser) {
        headers["x-goog-quota-user"] = quotaUser;
    }
    const response = await localClient.post(`/${resourceName}:testIamPermissions`, { permissions }, { headers });
    const allowed = new Set(response.body.permissions || []);
    const missing = new Set(permissions);
    for (const p of allowed) {
        missing.delete(p);
    }
    return {
        allowed: Array.from(allowed).sort(),
        missing: Array.from(missing).sort(),
        passed: missing.size === 0,
    };
}
exports.testResourceIamPermissions = testResourceIamPermissions;
/**
 * List permissions not held by the authenticating credential on the given project.
 * @param projectId The project against which to test permissions.
 * @param permissions An array of string permissions, e.g. `["cloudfunctions.functions.create"]`.
 */
async function testIamPermissions(projectId, permissions) {
    return testResourceIamPermissions((0, api_1.resourceManagerOrigin)(), "v1", `projects/${projectId}`, permissions, `projects/${projectId}`);
}
exports.testIamPermissions = testIamPermissions;
/** Helper to merge all required bindings into the IAM policy, returns boolean if the policy has been updated */
function mergeBindings(policy, requiredBindings) {
    let updated = false;
    for (const requiredBinding of requiredBindings) {
        const match = policy.bindings.find((b) => b.role === requiredBinding.role);
        if (!match) {
            updated = true;
            policy.bindings.push(requiredBinding);
            continue;
        }
        for (const requiredMember of requiredBinding.members) {
            if (!match.members.find((m) => m === requiredMember)) {
                updated = true;
                match.members.push(requiredMember);
            }
        }
    }
    return updated;
}
exports.mergeBindings = mergeBindings;
/** Utility to print the required binding commands */
function printManualIamConfig(requiredBindings, projectId, prefix) {
    utils.logLabeledBullet(prefix, "Failed to verify the project has the correct IAM bindings for a successful deployment.", "warn");
    utils.logLabeledBullet(prefix, "You can either re-run this command as a project owner or manually run the following set of `gcloud` commands:", "warn");
    for (const binding of requiredBindings) {
        for (const member of binding.members) {
            utils.logLabeledBullet(prefix, `\`gcloud projects add-iam-policy-binding ${projectId} ` +
                `--member=${member} ` +
                `--role=${binding.role}\``, "warn");
        }
    }
}
exports.printManualIamConfig = printManualIamConfig;
