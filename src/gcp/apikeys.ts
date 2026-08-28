import { apiKeysOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError, getErrStatus } from "../error";
import { LongRunningOperation, pollOperation } from "../operation-poller";

const API_VERSION = "v2";

const client = new Client({
  urlPrefix: apiKeysOrigin(),
  auth: true,
  apiVersion: API_VERSION,
});

interface ApiTarget {
  service: string;
  methods?: string[];
}

interface AndroidApplication {
  sha1Fingerprint: string;
  packageName: string;
}

interface AndroidKeyRestrictions {
  allowedApplications: AndroidApplication[];
}

interface IosKeyRestrictions {
  allowedBundleIds: string[];
}

interface BrowserKeyRestrictions {
  allowedReferrers: string[];
}

interface ServerKeyRestrictions {
  allowedIps: string[];
}

interface Restrictions {
  apiTargets?: ApiTarget[];
  browserKeyRestrictions?: BrowserKeyRestrictions;
  serverKeyRestrictions?: ServerKeyRestrictions;
  androidKeyRestrictions?: AndroidKeyRestrictions;
  iosKeyRestrictions?: IosKeyRestrictions;
}

interface Key {
  name: string;
  displayName?: string;
  keyString: string;
  restrictions?: Restrictions;
}

interface LookupKeyResponse {
  name: string;
  parent: string;
  displayName?: string;
}

/**
 * Ensures that a specific service is allowed under the restrictions of the API key
 * identified by the given API key string.
 *
 * If the API key is unrestricted, this is a no-op. If it is restricted and does not
 * already allow the service, the service is added to the key's allowed API targets.
 *
 * @param apiKeyString The API key string (e.g. "AIzaSy...") to update.
 * @param service The service to allow (e.g. "firebasetelemetry.googleapis.com").
 */
export async function updateAppApiKeyRestriction(
  apiKeyString: string,
  service: string,
): Promise<void> {
  const lookup = await lookupKeyResourceName(apiKeyString);
  const key = await getKeyWithResourceName(lookup.name);
  await ensureServiceInKeyRestrictions(key, service);
}

/**
 * Looks up the key resource name and parent for a given API key string.
 * Ref: https://cloud.google.com/api-keys/docs/reference/rest/v2/keys/lookupKey
 */
async function lookupKeyResourceName(apiKeyString: string): Promise<LookupKeyResponse> {
  try {
    const res = await client.get<LookupKeyResponse>("/keys:lookupKey", {
      queryParams: { keyString: apiKeyString },
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
async function getKeyWithResourceName(keyResourceName: string): Promise<Key> {
  try {
    const res = await client.get<Key>(keyResourceName);
    return res.body;
  } catch (err: unknown) {
    if (getErrStatus(err) === 403) {
      throw new FirebaseError(
        `Permission denied when retrieving API key ${keyResourceName}.\n\n` +
          `To resolve this, ensure your account has the right permissions on the project in the Google Cloud Console:\n\n` +
          `  ${getCredentialsConsoleUrl()}`,
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
async function ensureServiceInKeyRestrictions(key: Key, service: string): Promise<void> {
  if (!key.restrictions?.apiTargets || key.restrictions.apiTargets.length === 0) {
    return;
  }

  const alreadyAllowed = key.restrictions.apiTargets.some((target) => target.service === service);
  if (alreadyAllowed) {
    return;
  }

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
          `  ${getCredentialsConsoleUrl()}`,
        { original: err instanceof Error ? err : undefined, status: 403 },
      );
    }
    throw err;
  }
}

/**
 * Returns the URL to the Google Cloud Console credentials page.
 */
function getCredentialsConsoleUrl(): string {
  return "https://console.cloud.google.com/apis/credentials";
}
