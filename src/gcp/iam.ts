import { resourceManagerOrigin, iamOrigin } from "../api";
import { logger } from "../logger";
import { Client } from "../apiv2";

const apiClient = new Client({ urlPrefix: iamOrigin, apiVersion: "v1" });

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

export interface Role {
  name: string;
  title?: string;
  description?: string;
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

export interface TestIamResult {
  allowed: string[];
  missing: string[];
  passed: boolean;
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
  displayName: string,
): Promise<ServiceAccount> {
  const response = await apiClient.post<
    { accountId: string; serviceAccount: { displayName: string; description: string } },
    ServiceAccount
  >(
    `/projects/${projectId}/serviceAccounts`,
    {
      accountId,
      serviceAccount: {
        displayName,
        description,
      },
    },
    { skipLog: { resBody: true } },
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
  serviceAccountName: string,
): Promise<ServiceAccount> {
  const response = await apiClient.get<ServiceAccount>(
    `/projects/${projectId}/serviceAccounts/${serviceAccountName}@${projectId}.iam.gserviceaccount.com`,
  );
  return response.body;
}

/**
 * Creates a key for a given service account.
 */
export async function createServiceAccountKey(
  projectId: string,
  serviceAccountName: string,
): Promise<ServiceAccountKey> {
  const response = await apiClient.post<
    { keyAlgorithm: string; privateKeyType: string },
    ServiceAccountKey
  >(
    `/projects/${projectId}/serviceAccounts/${serviceAccountName}@${projectId}.iam.gserviceaccount.com/keys`,
    {
      keyAlgorithm: "KEY_ALG_UNSPECIFIED",
      privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE",
    },
  );
  return response.body;
}

/**
 * @param projectId the id of the project containing the service account
 * @param accountEmail the email of the service account to delete
 */
export async function deleteServiceAccount(projectId: string, accountEmail: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/serviceAccounts/${accountEmail}`, {
    resolveOnHTTPError: true,
  });
}

/**
 * Lists every key for a given service account.
 */
export async function listServiceAccountKeys(
  projectId: string,
  serviceAccountName: string,
): Promise<ServiceAccountKey[]> {
  const response = await apiClient.get<{ keys: ServiceAccountKey[] }>(
    `/projects/${projectId}/serviceAccounts/${serviceAccountName}@${projectId}.iam.gserviceaccount.com/keys`,
  );
  return response.body.keys;
}

/**
 * Given a name, returns corresponding Role, see
 * https://cloud.google.com/iam/reference/rest/v1/organizations.roles#Role
 * for more details.
 * @param role The IAM role to get, e.g. "editor".
 * @return Details about the IAM role.
 */
export async function getRole(role: string): Promise<Role> {
  const response = await apiClient.get<Role>(`/roles/${role}`, {
    retryCodes: [500, 503],
  });
  return response.body;
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
  permissions: string[],
  quotaUser = "",
): Promise<TestIamResult> {
  const localClient = new Client({ urlPrefix: origin, apiVersion });
  if (process.env.FIREBASE_SKIP_INFORMATIONAL_IAM) {
    logger.debug(
      `[iam] skipping informational check of permissions ${JSON.stringify(
        permissions,
      )} on resource ${resourceName}`,
    );
    return { allowed: Array.from(permissions).sort(), missing: [], passed: true };
  }
  const headers: Record<string, string> = {};
  if (quotaUser) {
    headers["x-goog-quota-user"] = quotaUser;
  }
  const response = await localClient.post<{ permissions: string[] }, { permissions: string[] }>(
    `/${resourceName}:testIamPermissions`,
    { permissions },
    { headers },
  );

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

/**
 * List permissions not held by the authenticating credential on the given project.
 * @param projectId The project against which to test permissions.
 * @param permissions An array of string permissions, e.g. `["cloudfunctions.functions.create"]`.
 */
export async function testIamPermissions(
  projectId: string,
  permissions: string[],
): Promise<TestIamResult> {
  return testResourceIamPermissions(
    resourceManagerOrigin,
    "v1",
    `projects/${projectId}`,
    permissions,
    `projects/${projectId}`,
  );
}
