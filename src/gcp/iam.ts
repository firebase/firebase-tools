import * as api from "../api";
import { endpoint } from "../utils";
import { difference } from "lodash";
import { debug } from "../logger";

const API_VERSION = "v1";

// IAM Policy
// https://cloud.google.com/resource-manager/reference/rest/Shared.Types/Policy
export interface Binding {
  role: string;
  members: string[];
  condition?: { [key: string]: string };
}

export interface Policy {
  bindings: Binding[];
  etag: string;
  version: number;
}

export interface ServiceAccount {
  name: string;
  projectId: string;
  uniqueId: string;
  email: string;
  displayName: string;
  etag: string;
  description: string;
  oauth2ClientId: string;
  disabled: boolean;
}

export interface ServiceAccountKey {
  name: string;
  privateKeyType: string;
  keyAlgorithm: string;
  privateKeyData: string;
  publicKeyData: string;
  validAfterTime: string;
  validBeforeTime: string;
  keyOrigin: string;
  keyType: string;
}

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
 * Retrieves a service account with the given parameters.
 *
 * @param projectId the id of the project where the service account will be created
 * @param serviceAccountName the name of the service account
 */
export async function getServiceAccount(
  projectId: string,
  serviceAccountName: string
): Promise<ServiceAccount> {
  const response = await api.request(
    "GET",
    `/${API_VERSION}/projects/${projectId}/serviceAccounts/${serviceAccountName}@${projectId}.iam.gserviceaccount.com`,
    {
      auth: true,
      origin: api.iamOrigin,
    }
  );
  return response.body;
}

export async function createServiceAccountKey(
  projectId: string,
  serviceAccountName: string
): Promise<ServiceAccountKey> {
  const response = await api.request(
    "POST",
    `/${API_VERSION}/projects/${projectId}/serviceAccounts/${serviceAccountName}@${projectId}.iam.gserviceaccount.com/keys`,
    {
      auth: true,
      origin: api.iamOrigin,
      data: {
        keyAlgorithm: "KEY_ALG_UNSPECIFIED",
        privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE",
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

export interface TestIamResult {
  allowed: string[];
  missing: string[];
  passed: boolean;
}

/**
 * List permissions not held by an arbitrary resource implementing the IAM APIs.
 *
 * @param origin Resource origin e.g. `https:// iam.googleapis.com`.
 * @param apiVersion API version e.g. `v1`.
 * @param resourceName Resource name e.g. `projects/my-projct/widgets/abc`
 * @param permissions An array of string permissions, e.g. `["iam.serviceAccounts.actAs"]`
 */
export async function testResourceIamPermissions(
  origin: string,
  apiVersion: string,
  resourceName: string,
  permissions: string[]
): Promise<TestIamResult> {
  if (process.env.FIREBASE_SKIP_INFORMATIONAL_IAM) {
    debug(
      "[iam] skipping informational check of permissions",
      JSON.stringify(permissions),
      "on resource",
      resourceName
    );
    return { allowed: permissions, missing: [], passed: true };
  }
  const response = await api.request("POST", `/${apiVersion}/${resourceName}:testIamPermissions`, {
    auth: true,
    data: { permissions },
    origin,
  });

  const allowed = (response.body.permissions || []).sort();
  const missing = difference(permissions, allowed);

  return {
    allowed,
    missing,
    passed: missing.length === 0,
  };
}

/**
 * List permissions not held by the authenticating credential on the given project.
 * @param projectId The project against which to test permissions.
 * @param permissions An array of string permissions, e.g. `["cloudfunctions.functions.create"]`.
 */
export async function testIamPermissions(
  projectId: string,
  permissions: string[]
): Promise<TestIamResult> {
  return testResourceIamPermissions(
    api.resourceManagerOrigin,
    "v1",
    `projects/${projectId}`,
    permissions
  );
}
