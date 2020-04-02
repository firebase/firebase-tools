import * as api from "../api";
import { endpoint } from "../utils";
import { difference } from "lodash";

const API_VERSION = "v1";

/**
 * Creates a new the service account with the given parameters.
 *
 * @param projectId the id of the project where the service account will be created
 * @param accountId the id to use for the account
 * @param description a brief description of the account
 * @param displayName a user-friendly name to be displayed on the console
 */
export async function createServiceAccount(
  projectId: string,
  accountId: string,
  description: string,
  displayName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const response = await api.request(
    "POST",
    `/${API_VERSION}/projects/${projectId}/serviceAccounts`,
    {
      auth: true,
      origin: api.iamOrigin,
      data: {
        accountId,
        serviceAccount: {
          displayName,
          description,
        },
      },
    }
  );
  return response.body;
}

/**
 *
 * @param projectId the id of the project containing the service account
 * @param accountEmail the email of the service account to delete
 * @return The raw API response, including status, body, etc.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deleteServiceAccount(projectId: string, accountEmail: string): Promise<any> {
  return api.request(
    "DELETE",
    `/${API_VERSION}/projects/${projectId}/serviceAccounts/${accountEmail}`,
    {
      auth: true,
      origin: api.iamOrigin,
      resolveOnHTTPError: true,
    }
  );
}

/**
 * Given a name, returns corresponding Role, see
 * https://cloud.google.com/iam/reference/rest/v1/organizations.roles#Role
 * for more details.
 * @param role The IAM role to get, e.g. "editor".
 * @return Details about the IAM role.
 */
export async function getRole(role: string): Promise<{ title: string; description: string }> {
  const response = await api.request("GET", endpoint([API_VERSION, "roles", role]), {
    auth: true,
    origin: api.iamOrigin,
    retryCodes: [500, 503],
  });
  return response.body;
}

/**
 * List permissions not held by the authenticating credential on the given project.
 * @param projectId The project against which to test permissions.
 * @param permissions An array of string permissions, e.g. `["cloudfunctions.functions.create"]`.
 */
export async function testIamPermissions(
  projectId: string,
  permissions: string[]
): Promise<{ allowed: string[]; missing: string[]; passed: boolean }> {
  const response = await api.request("POST", `/v1/projects/${projectId}:testIamPermissions`, {
    auth: true,
    data: { permissions },
    origin: api.resourceManagerOrigin,
  });

  const allowed = (response.body.permissions || []).sort();
  const missing = difference(permissions, allowed);

  return {
    allowed,
    missing,
    passed: missing.length === 0,
  };
}
