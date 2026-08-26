import { apiKeysOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError, getErrStatus } from "../error";
import { OperationResult, pollOperation } from "../operation-poller";

export const API_VERSION = "v2";

export const client = new Client({
  urlPrefix: apiKeysOrigin(),
  auth: true,
  apiVersion: API_VERSION,
});

export interface ApiTarget {
  service: string;
  methods?: string[];
}

export interface AndroidApplication {
  sha1Fingerprint: string;
  packageName: string;
}

export interface AndroidKeyRestrictions {
  allowedApplications: AndroidApplication[];
}

export interface IosKeyRestrictions {
  allowedBundleIds: string[];
}

export interface BrowserKeyRestrictions {
  allowedReferrers: string[];
}

export interface ServerKeyRestrictions {
  allowedIps: string[];
}

export interface Restrictions {
  apiTargets?: ApiTarget[];
  browserKeyRestrictions?: BrowserKeyRestrictions;
  serverKeyRestrictions?: ServerKeyRestrictions;
  androidKeyRestrictions?: AndroidKeyRestrictions;
  iosKeyRestrictions?: IosKeyRestrictions;
}

export interface Key {
  name: string;
  displayName?: string;
  restrictions?: Restrictions;
}

export interface LookupKeyResponse {
  name: string;
  parent: string;
  displayName?: string;
}

function getCredentialsConsoleUrl(projectId?: string): string {
  return projectId
    ? `https://console.cloud.google.com/apis/credentials?project=${projectId}`
    : `https://console.cloud.google.com/apis/credentials`;
}

/**
 * Looks up the key resource name and parent for a given API key string.
 * Ref: https://cloud.google.com/api-keys/docs/reference/rest/v2/keys/lookupKey
 */
export async function lookupKey(keyString: string): Promise<LookupKeyResponse> {
  try {
    const res = await client.get<LookupKeyResponse>("/keys:lookupKey", {
      queryParams: { keyString },
    });
    return res.body;
  } catch (err: unknown) {
    if (getErrStatus(err) === 403) {
      throw new FirebaseError(
        `Permission denied when looking up API key.\n\n` +
        `To resolve this, ensure your account has the right permissions on the project in the Google Cloud Console:\n\n` +
        `  ${getCredentialsConsoleUrl()}`,
        { original: err instanceof Error ? err : undefined, status: 403 },
      );
    }
    throw err;
  }
}

/**
 * Gets the details of an API key given its resource name.
 * Ref: https://cloud.google.com/api-keys/docs/reference/rest/v2/projects.locations.keys/get
 */
export async function getKey(keyName: string): Promise<Key> {
  const path = keyName.startsWith("/") ? keyName : `/${keyName}`;
  try {
    const res = await client.get<Key>(path);
    return res.body;
  } catch (err: unknown) {
    if (getErrStatus(err) === 403) {
      const projectId = extractProjectId(keyName.replace(/^\//, ""));
      throw new FirebaseError(
        `Permission denied when retrieving API key ${keyName}.\n\n` +
        `To resolve this, ensure your account has the right permissions on the project in the Google Cloud Console:\n\n` +
        `  ${getCredentialsConsoleUrl(projectId)}`,
        { original: err instanceof Error ? err : undefined, status: 403 },
      );
    }
    throw err;
  }
}

/**
 * Retrieves an API key's full resource by its key string.
 */
export async function getKeyByString(keyString: string): Promise<Key> {
  const lookup = await lookupKey(keyString);
  return getKey(lookup.name);
}

/**
 * Updates the properties of an API key, tracking the long-running operation until completion.
 * Ref: https://cloud.google.com/api-keys/docs/reference/rest/v2/projects.locations.keys/patch
 */
async function updateKey(key: Key, updateMask: string[] = ["restrictions"]): Promise<Key> {
  const queryParams: Record<string, string> = {};
  if (updateMask.length > 0) {
    queryParams.updateMask = updateMask.join(",");
  }
  const path = key.name.startsWith("/") ? key.name : `/${key.name}`;

  try {
    const res = await client.patch<Key, OperationResult<Key> & { name: string }>(path, key, {
      queryParams,
    });

    if (res.body.done && res.body.response) {
      return res.body.response;
    }

    return await pollOperation<Key>({
      apiOrigin: apiKeysOrigin(),
      apiVersion: API_VERSION,
      operationResourceName: res.body.name,
    });
  } catch (err: unknown) {
    if (getErrStatus(err) === 403) {
      const keyIdentifier = key.displayName ? `${key.displayName} (${key.name})` : key.name;
      const projectId = extractProjectId(key.name.replace(/^\//, ""));
      throw new FirebaseError(
        `Permission denied when updating API key ${keyIdentifier}.\n\n` +
        `To resolve this, ensure your account has the right permissions on the project in the Google Cloud Console:\n\n` +
        `  ${getCredentialsConsoleUrl(projectId)}`,
        { original: err instanceof Error ? err : undefined, status: 403 },
      );
    }
    throw err;
  }
}

export interface ListKeysResponse {
  keys?: Key[];
  nextPageToken?: string;
}

/**
 * Lists all API keys for a project, handling pagination.
 * Ref: https://cloud.google.com/api-keys/docs/reference/rest/v2/projects.locations.keys/list
 */
export async function listKeys(projectId: string): Promise<Key[]> {
  const parent = `projects/${projectId}/locations/global`;
  let pageToken: string | undefined;
  const keys: Key[] = [];

  try {
    do {
      const queryParams: Record<string, string> = pageToken ? { pageToken } : {};
      const res = await client.get<ListKeysResponse>(`/${parent}/keys`, { queryParams });
      if (res.body.keys) {
        keys.push(...res.body.keys);
      }
      pageToken = res.body.nextPageToken;
    } while (pageToken);

    return keys;
  } catch (err: unknown) {
    if (getErrStatus(err) === 403) {
      throw new FirebaseError(
        `Permission denied when listing API keys for project ${projectId}.\n\n` +
        `To resolve this, ensure your account has the right permissions on the project in the Google Cloud Console:\n\n` +
        `  ${getCredentialsConsoleUrl(projectId)}`,
        { original: err instanceof Error ? err : undefined, status: 403 },
      );
    }
    throw err;
  }
}

/**
 * Ensures a specific service is permitted in an API key's restrictions.
 *
 * - If the key is unrestricted (`apiTargets` is undefined or empty), no changes are made
 *   because the key is already allowed to access all enabled services on the project.
 * - If the key is restricted and already includes the service, no update is performed.
 * - If the key is restricted and is missing the service, the service is appended to `apiTargets`
 *   and the key is updated.
 */
export async function ensureServiceInKeyRestrictions(
  key: Key | string,
  service: string,
): Promise<{ updated: boolean; key: Key }> {
  const resolvedKey = typeof key === "string" ? await getKeyByString(key) : key;

  if (!resolvedKey.restrictions?.apiTargets || resolvedKey.restrictions.apiTargets.length === 0) {
    return { updated: false, key: resolvedKey };
  }

  const alreadyAllowed = resolvedKey.restrictions.apiTargets.some(
    (target) => target.service === service,
  );
  if (alreadyAllowed) {
    return { updated: false, key: resolvedKey };
  }

  const updatedRestrictions: Restrictions = {
    ...resolvedKey.restrictions,
    apiTargets: [...resolvedKey.restrictions.apiTargets, { service }],
  };

  const updatedKey = await updateKey(
    {
      ...resolvedKey,
      restrictions: updatedRestrictions,
    },
    ["restrictions"],
  );

  return { updated: true, key: updatedKey };
}

/**
 * Ensures a specific service is permitted across all restricted API keys in a project.
 *
 * - For keys that are unrestricted (`apiTargets` is undefined or empty), no changes are made
 *   to avoid accidentally restricting them.
 * - For keys that are restricted and missing the service, the service is appended to `apiTargets`.
 */
export async function updateAllApiKeysRestriction(
  projectId: string,
  service: string,
): Promise<void> {
  const keys = await listKeys(projectId);
  await Promise.all(keys.map((key) => ensureServiceInKeyRestrictions(key, service)));
}

/**
 * Updates restrictions across all API keys in a project using a custom updater function.
 *
 * The updater function receives the current `Restrictions` and `Key`. If it returns a new
 * `Restrictions` object, the key is updated. If it returns undefined or null, the key is skipped.
 *
export async function updateProjectKeyRestrictions(
  projectId: string,
  updater: (restrictions: Restrictions, key: Key) => Restrictions | undefined | null,
): Promise<{ updatedKeys: Key[]; unchangedKeys: Key[] }> {
  const keys = await listKeys(projectId);
  const updatedKeys: Key[] = [];
  const unchangedKeys: Key[] = [];

  for (const key of keys) {
    const newRestrictions = updater(key.restrictions || {}, key);
    if (newRestrictions) {
      const updatedKey = await updateKey(
        {
          ...key,
          restrictions: newRestrictions,
        },
        ["restrictions"],
      );
      updatedKeys.push(updatedKey);
    } else {
      unchangedKeys.push(key);
    }
  }

  return { updatedKeys, unchangedKeys };
}*/
