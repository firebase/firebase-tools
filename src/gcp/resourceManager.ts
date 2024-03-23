import { findIndex } from "lodash";
import { resourceManagerOrigin } from "../api";
import { Client } from "../apiv2";
import { Binding, getServiceAccount, Policy } from "./iam";

const API_VERSION = "v1";

const apiClient = new Client({ urlPrefix: resourceManagerOrigin, apiVersion: API_VERSION });

// Roles listed at https://firebase.google.com/docs/projects/iam/roles-predefined-product
export const firebaseRoles = {
  apiKeysViewer: "roles/serviceusage.apiKeysViewer",
  authAdmin: "roles/firebaseauth.admin",
  functionsDeveloper: "roles/cloudfunctions.developer",
  hostingAdmin: "roles/firebasehosting.admin",
  runViewer: "roles/run.viewer",
};

/**
 * Fetches the IAM Policy of a project.
 * https://cloud.google.com/resource-manager/reference/rest/v1/projects/getIamPolicy
 *
 * @param projectIdOrNumber the id of the project whose IAM Policy you want to get
 */
export async function getIamPolicy(projectIdOrNumber: string): Promise<Policy> {
  const response = await apiClient.post<void, Policy>(
    `/projects/${projectIdOrNumber}:getIamPolicy`,
  );
  return response.body;
}

/**
 * Sets the IAM Policy of a project.
 * https://cloud.google.com/resource-manager/reference/rest/v1/projects/setIamPolicy
 *
 * @param projectIdOrNumber the id of the project for which you want to set a new IAM Policy
 * @param newPolicy the new IAM policy for the project
 * @param updateMask A FieldMask specifying which fields of the policy to modify
 */
export async function setIamPolicy(
  projectIdOrNumber: string,
  newPolicy: Policy,
  updateMask = "",
): Promise<Policy> {
  const response = await apiClient.post<{ policy: Policy; updateMask: string }, Policy>(
    `/projects/${projectIdOrNumber}:setIamPolicy`,
    {
      policy: newPolicy,
      updateMask: updateMask,
    },
  );
  return response.body;
}

/**
 * Update the IAM Policy of a project to include a service account in a role.
 *
 * @param projectId the id of the project whose IAM Policy you want to set
 * @param serviceAccountName the name of the service account
 * @param roles the new roles of the service account
 */
export async function addServiceAccountToRoles(
  projectId: string,
  serviceAccountName: string,
  roles: string[],
  skipAccountLookup = false,
): Promise<Policy> {
  const [{ name: fullServiceAccountName }, projectPolicy] = await Promise.all([
    skipAccountLookup
      ? Promise.resolve({ name: serviceAccountName })
      : getServiceAccount(projectId, serviceAccountName),
    getIamPolicy(projectId),
  ]);

  // The way the service account name is formatted in the Policy object
  // https://cloud.google.com/iam/docs/reference/rest/v1/Policy
  // serviceAccount:my-project-id@appspot.gserviceaccount.com
  const newMemberName = `serviceAccount:${fullServiceAccountName.split("/").pop()}`;

  roles.forEach((roleName) => {
    let bindingIndex = findIndex(
      projectPolicy.bindings,
      (binding: Binding) => binding.role === roleName,
    );

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

export async function serviceAccountHasRoles(
  projectId: string,
  serviceAccountName: string,
  roles: string[],
  skipAccountLookup = false,
): Promise<boolean> {
  const [{ name: fullServiceAccountName }, projectPolicy] = await Promise.all([
    skipAccountLookup
      ? Promise.resolve({ name: serviceAccountName })
      : getServiceAccount(projectId, serviceAccountName),
    getIamPolicy(projectId),
  ]);

  // The way the service account name is formatted in the Policy object
  // https://cloud.google.com/iam/docs/reference/rest/v1/Policy
  // serviceAccount:my-project-id@appspot.gserviceaccount.com
  const memberName = `serviceAccount:${fullServiceAccountName.split("/").pop()}`;

  for (const roleName of roles) {
    const binding = projectPolicy.bindings.find((b: Binding) => b.role === roleName);
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
