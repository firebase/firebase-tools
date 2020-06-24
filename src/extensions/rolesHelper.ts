import * as _ from "lodash";
import * as api from "../api";
import * as utils from "../utils";
import { Role } from "./extensionsApi";
import { iam } from "../gcp";
import { getRandomString } from "./utils";

const API_VERSION = "v1";

/**
 * Grants IAM roles to a service account, for it to act on the project (write in datastore, etc.).
 * Supports roles listed in https://cloud.google.com/iam/docs/understanding-roles
 * @param {string} projectId
 * @param {string} serviceAccountEmail
 * @param {Array<string>} rolesToAdd IAM roles to grant to this service account
 * @param {Array<string>} rolesToRemove IAM roles to remove from this service account.
 *                                      Any roles not included here will not be modified.
 * @return {Promise<*>}
 */

export function grantRoles(
  projectId: string,
  serviceAccountEmail: string,
  rolesToAdd: string[],
  rolesToRemove: string[] = []
): Promise<any> {
  rolesToAdd = rolesToAdd.map((role) => `roles/${role}`);
  rolesToRemove = rolesToRemove.map((role) => `roles/${role}`);
  return api
    .request("POST", utils.endpoint([API_VERSION, "projects", projectId, ":getIamPolicy"]), {
      data: {
        options: { requestedPolicyVersion: 3 },
      },
      auth: true,
      origin: api.resourceManagerOrigin,
    })
    .then((response) => {
      const policy = response.body;
      const bindings = policy.bindings;

      rolesToAdd.forEach((role) => {
        bindings.push({ role, members: [`serviceAccount:${serviceAccountEmail}`] });
      });

      rolesToRemove.forEach((role) => {
        const binding = _.find(bindings, (b) => {
          return b.role === role;
        });
        _.remove(binding.members, (member) => {
          return member === `serviceAccount:${serviceAccountEmail}`;
        });
      });
      return api.request(
        "POST",
        utils.endpoint([API_VERSION, "projects", projectId, ":setIamPolicy"]),
        {
          auth: true,
          origin: api.resourceManagerOrigin,
          data: { policy },
        }
      );
    });
}

/**
 * Creates a new service account to use with an instance of ExtensionSpec,
 * then gives it the appropriate IAM policies, and returns the email
 *
 * @param source a ExtensionSpec
 * @returns the email of the created service account
 */
export async function createServiceAccountAndSetRoles(
  projectId: string,
  roles: Role[],
  instanceId: string
): Promise<any> {
  let serviceAccount;
  const shortenedInstanceId =
    instanceId.length <= 26 ? instanceId : `${instanceId.slice(0, 21)}-${getRandomString(4)}`;
  try {
    serviceAccount = await iam.createServiceAccount(
      projectId,
      `ext-${shortenedInstanceId}`,
      `Runtime service account for Firebase Extension ${instanceId}`,
      `Firebase Extension ${instanceId} service account`
    );
  } catch (err) {
    if (err.status === 409) {
      // if the service account already exists
      return utils.reject(
        `A service account ext-${shortenedInstanceId} already exists in project ${projectId}. ` +
          `Please delete it or choose a different extension instance id.`,
        {
          exit: 1,
          status: 409,
        }
      );
    }
    throw err;
  }
  await grantRoles(
    projectId,
    serviceAccount.email,
    roles.map((role) => role.role)
  );
  return serviceAccount.email;
}
