"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceAccountHasRoles = exports.addServiceAccountToRoles = exports.setIamPolicy = exports.getIamPolicy = exports.firebaseRoles = void 0;
const lodash_1 = require("lodash");
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const iam_1 = require("./iam");
const API_VERSION = "v1";
const apiClient = new apiv2_1.Client({ urlPrefix: (0, api_1.resourceManagerOrigin)(), apiVersion: API_VERSION });
// Roles listed at https://firebase.google.com/docs/projects/iam/roles-predefined-product
exports.firebaseRoles = {
    apiKeysViewer: "roles/serviceusage.apiKeysViewer",
    authAdmin: "roles/firebaseauth.admin",
    functionsDeveloper: "roles/cloudfunctions.developer",
    hostingAdmin: "roles/firebasehosting.admin",
    runViewer: "roles/run.viewer",
    serviceUsageConsumer: "roles/serviceusage.serviceUsageConsumer",
};
/**
 * Fetches the IAM Policy of a project.
 * https://cloud.google.com/resource-manager/reference/rest/v1/projects/getIamPolicy
 *
 * @param projectIdOrNumber the id of the project whose IAM Policy you want to get
 */
async function getIamPolicy(projectIdOrNumber) {
    const response = await apiClient.post(`/projects/${projectIdOrNumber}:getIamPolicy`);
    return response.body;
}
exports.getIamPolicy = getIamPolicy;
/**
 * Sets the IAM Policy of a project.
 * https://cloud.google.com/resource-manager/reference/rest/v1/projects/setIamPolicy
 *
 * @param projectIdOrNumber the id of the project for which you want to set a new IAM Policy
 * @param newPolicy the new IAM policy for the project
 * @param updateMask A FieldMask specifying which fields of the policy to modify
 */
async function setIamPolicy(projectIdOrNumber, newPolicy, updateMask = "") {
    const response = await apiClient.post(`/projects/${projectIdOrNumber}:setIamPolicy`, {
        policy: newPolicy,
        updateMask: updateMask,
    });
    return response.body;
}
exports.setIamPolicy = setIamPolicy;
/**
 * Update the IAM Policy of a project to include a service account in a role.
 *
 * @param projectId the id of the project whose IAM Policy you want to set
 * @param serviceAccountName the name of the service account
 * @param roles the new roles of the service account
 */
async function addServiceAccountToRoles(projectId, serviceAccountName, roles, skipAccountLookup = false) {
    const [{ name: fullServiceAccountName }, projectPolicy] = await Promise.all([
        skipAccountLookup
            ? Promise.resolve({ name: serviceAccountName })
            : (0, iam_1.getServiceAccount)(projectId, serviceAccountName),
        getIamPolicy(projectId),
    ]);
    // The way the service account name is formatted in the Policy object
    // https://cloud.google.com/iam/docs/reference/rest/v1/Policy
    // serviceAccount:my-project-id@appspot.gserviceaccount.com
    const newMemberName = `serviceAccount:${fullServiceAccountName.split("/").pop()}`;
    roles.forEach((roleName) => {
        let bindingIndex = (0, lodash_1.findIndex)(projectPolicy.bindings, (binding) => binding.role === roleName);
        // create a new binding if the role doesn't exist in the policy yet
        if (bindingIndex === -1) {
            bindingIndex =
                projectPolicy.bindings.push({
                    role: roleName,
                    members: [],
                }) - 1;
        }
        const binding = projectPolicy.bindings[bindingIndex];
        // No need to update if service account already has role
        if (!binding.members.includes(newMemberName)) {
            binding.members.push(newMemberName);
        }
    });
    return setIamPolicy(projectId, projectPolicy, "bindings");
}
exports.addServiceAccountToRoles = addServiceAccountToRoles;
async function serviceAccountHasRoles(projectId, serviceAccountName, roles, skipAccountLookup = false) {
    const [{ name: fullServiceAccountName }, projectPolicy] = await Promise.all([
        skipAccountLookup
            ? Promise.resolve({ name: serviceAccountName })
            : (0, iam_1.getServiceAccount)(projectId, serviceAccountName),
        getIamPolicy(projectId),
    ]);
    // The way the service account name is formatted in the Policy object
    // https://cloud.google.com/iam/docs/reference/rest/v1/Policy
    // serviceAccount:my-project-id@appspot.gserviceaccount.com
    const memberName = `serviceAccount:${fullServiceAccountName.split("/").pop()}`;
    for (const roleName of roles) {
        const binding = projectPolicy.bindings.find((b) => b.role === roleName);
        if (!binding) {
            return false;
        }
        // No need to update if service account already has role
        if (!binding.members.includes(memberName)) {
            return false;
        }
    }
    return true;
}
exports.serviceAccountHasRoles = serviceAccountHasRoles;
