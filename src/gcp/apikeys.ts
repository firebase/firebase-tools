import { apiKeysOrigin } from "../api";
import { Client } from "../apiv2";
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
  uid?: string;
  displayName?: string;
  keyString?: string;
  restrictions?: Restrictions;
  etag?: string;
  createTime?: string;
  updateTime?: string;
  deleteTime?: string;
}

export interface LookupKeyResponse {
  name: string;
  parent: string;
  displayName?: string;
}

/**
 * Looks up the key resource name and parent for a given API key string.
 * Ref: https://cloud.google.com/api-keys/docs/reference/rest/v2/keys/lookupKey
 */
export async function lookupKey(keyString: string): Promise<LookupKeyResponse> {
  const res = await client.get<LookupKeyResponse>("/keys:lookupKey", {
    queryParams: { keyString },
  });
  return res.body;
}

/**
 * Gets the details of an API key given its resource name.
 * Ref: https://cloud.google.com/api-keys/docs/reference/rest/v2/projects.locations.keys/get
 */
export async function getKey(keyName: string): Promise<Key> {
  const path = keyName.startsWith("/") ? keyName : `/${keyName}`;
  const res = await client.get<Key>(path);
  return res.body;
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
export async function updateKey(key: Key, updateMask: string[] = ["restrictions"]): Promise<Key> {
  const queryParams: Record<string, string> = {};
  if (updateMask.length > 0) {
    queryParams.updateMask = updateMask.join(",");
  }
  const path = key.name.startsWith("/") ? key.name : `/${key.name}`;
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

  do {
    const queryParams: Record<string, string> = pageToken ? { pageToken } : {};
    const res = await client.get<ListKeysResponse>(`/${parent}/keys`, { queryParams });
    if (res.body.keys) {
      keys.push(...res.body.keys);
    }
    pageToken = res.body.nextPageToken;
  } while (pageToken);

  return keys;
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
export async function ensureServiceInProjectKeyRestrictions(
  projectId: string,
  service: string,
): Promise<{ updatedKeys: Key[]; unchangedKeys: Key[] }> {
  const keys = await listKeys(projectId);
  const updatedKeys: Key[] = [];
  const unchangedKeys: Key[] = [];

  for (const key of keys) {
    const result = await ensureServiceInKeyRestrictions(key, service);
    if (result.updated) {
      updatedKeys.push(result.key);
    } else {
      unchangedKeys.push(result.key);
    }
  }

  return { updatedKeys, unchangedKeys };
}

/**
 * Updates restrictions across all API keys in a project using a custom updater function.
 *
 * The updater function receives the current `Restrictions` and `Key`. If it returns a new
 * `Restrictions` object, the key is updated. If it returns undefined or null, the key is skipped.
 */
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
}
