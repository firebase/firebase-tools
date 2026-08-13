import { apiKeysOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError, getErrStatus } from "../error";
import { LongRunningOperation, pollOperation } from "../operation-poller";

const API_VERSION = "v2";
const CREDENTIALS_CONSOLE_URL = "https://console.cloud.google.com/apis/credentials";

const client = new Client({
  urlPrefix: apiKeysOrigin(),
  auth: true,
  apiVersion: API_VERSION,
});

interface ApiTarget {
  readonly service: string;
  readonly methods?: readonly string[];
}

interface AndroidApplication {
  readonly sha1Fingerprint: string;
  readonly packageName: string;
}

interface AndroidKeyRestrictions {
  readonly allowedApplications: readonly AndroidApplication[];
}

interface IosKeyRestrictions {
  readonly allowedBundleIds: readonly string[];
}

interface BrowserKeyRestrictions {
  readonly allowedReferrers: readonly string[];
}

interface ServerKeyRestrictions {
  readonly allowedIps: readonly string[];
}

interface Restrictions {
  readonly apiTargets?: readonly ApiTarget[];
  readonly browserKeyRestrictions?: BrowserKeyRestrictions;
  readonly serverKeyRestrictions?: ServerKeyRestrictions;
  readonly androidKeyRestrictions?: AndroidKeyRestrictions;
  readonly iosKeyRestrictions?: IosKeyRestrictions;
}

export interface Key {
  readonly name: string;
  readonly displayName?: string;
  readonly restrictions?: Restrictions;
}

interface LookupKeyResponse {
  readonly name: string;
}

/**
 * Ensures that a specific service is allowed under the restrictions of the API key
 * identified by the given API key string.
 *
 * If the API key is unrestricted, this is a no-op. If it is restricted and does not
 * already allow the service, the service is added to the key's allowed API targets.
 */
export async function updateAppApiKeyRestriction(options: {
  apiKey: string;
  service: string;
}): Promise<void> {
  const { apiKey, service } = options;
  const keyResourceName = await lookupKeyResourceName(apiKey);
  const key = await getKey(keyResourceName);
  await ensureServiceInKeyRestrictions(key, service);
}

/**
 * Looks up the key resource name for a given API key string.
 * Ref: https://cloud.google.com/api-keys/docs/reference/rest/v2/keys/lookupKey
 */
async function lookupKeyResourceName(apiKeyString: string): Promise<string> {
  try {
    const res = await client.get<LookupKeyResponse>("/keys:lookupKey", {
      queryParams: { keyString: apiKeyString },
    });
    return res.body.name;
  } catch (err: unknown) {
    if (getErrStatus(err) === 403) {
      throw new FirebaseError(
        `Permission denied when looking up API key.\n\n` +
          `To resolve this, ensure your account has the right permissions on the project in the Google Cloud Console:\n\n` +
          `  ${CREDENTIALS_CONSOLE_URL}`,
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
async function getKey(keyResourceName: string): Promise<Key> {
  try {
    const res = await client.get<Key>(keyResourceName);
    return res.body;
  } catch (err: unknown) {
    if (getErrStatus(err) === 403) {
      throw new FirebaseError(
        `Permission denied when retrieving API key ${keyResourceName}.\n\n` +
          `To resolve this, ensure your account has the right permissions on the project in the Google Cloud Console:\n\n` +
          `  ${CREDENTIALS_CONSOLE_URL}`,
        { original: err instanceof Error ? err : undefined, status: 403 },
      );
    }
    throw err;
  }
}

/**
 * Ensures a specific service is permitted in an API key's restrictions.
 */
async function ensureServiceInKeyRestrictions(key: Key, service: string): Promise<void> {
  // If the key is unrestricted, no update is made
  if (!key.restrictions?.apiTargets || key.restrictions.apiTargets.length === 0) {
    return;
  }

  // If the key is restricted and already includes the service, no update is made
  const alreadyAllowed = key.restrictions.apiTargets.some((target) => target.service === service);
  if (alreadyAllowed) {
    return;
  }

  // If the key is restricted and is missing the service, key is updated
  const updatedRestrictions: Restrictions = {
    ...key.restrictions,
    apiTargets: [...key.restrictions.apiTargets, { service }],
  };

  await updateKeyRestrictions({
    ...key,
    restrictions: updatedRestrictions,
  });
}

/**
 * Updates the properties of an API key, tracking the long-running operation until completion.
 * Ref: https://cloud.google.com/api-keys/docs/reference/rest/v2/projects.locations.keys/patch
 */
async function updateKeyRestrictions(key: Key): Promise<void> {
  const queryParams: Record<string, string> = { updateMask: "restrictions" };

  try {
    const res = await client.patch<Key, LongRunningOperation<Key>>(key.name, key, {
      queryParams,
    });

    await pollOperation<Key>({
      apiOrigin: apiKeysOrigin(),
      apiVersion: API_VERSION,
      operationResourceName: res.body.name,
    });
  } catch (err: unknown) {
    if (getErrStatus(err) === 403) {
      const keyIdentifier = key.displayName ? `${key.displayName} (${key.name})` : key.name;
      throw new FirebaseError(
        `Permission denied when updating API key ${keyIdentifier}.\n\n` +
          `To resolve this, ensure your account has the right permissions on the project in the Google Cloud Console:\n\n` +
          `  ${CREDENTIALS_CONSOLE_URL}`,
        { original: err instanceof Error ? err : undefined, status: 403 },
      );
    }
    throw err;
  }
}
