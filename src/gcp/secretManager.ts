import * as iam from "./iam";

import { logLabeledSuccess } from "../utils";
import { FirebaseError } from "../error";
import { Client } from "../apiv2";
import { secretManagerOrigin } from "../api";
import * as ensureApiEnabled from "../ensureApiEnabled";
import { needProjectId } from "../projectUtils";

// Matches projects/{PROJECT}/secrets/{SECRET}
const SECRET_NAME_REGEX = new RegExp(
  "projects\\/" +
    "(?<project>(?:\\d+)|(?:[A-Za-z]+[A-Za-z\\d-]*[A-Za-z\\d]?))\\/" +
    "secrets\\/" +
    "(?<secret>[A-Za-z\\d\\-_]+)",
);

// Matches projects/{PROJECT}/secrets/{SECRET}/versions/{latest|VERSION}
const SECRET_VERSION_NAME_REGEX = new RegExp(
  SECRET_NAME_REGEX.source + "\\/versions\\/" + "(?<version>latest|[0-9]+)",
);

export const secretManagerConsoleUri = (projectId: string) =>
  `https://console.cloud.google.com/security/secret-manager?project=${projectId}`;
export interface Secret {
  // Secret name/label (this is not resource name)
  name: string;
  // This is either projectID or number
  projectId: string;
  labels: Record<string, string>;
  replication: Replication;
}

export interface WireSecret {
  name: string;
  labels: Record<string, string>;
  replication: Replication;
}

type SecretVersionState = "STATE_UNSPECIFIED" | "ENABLED" | "DISABLED" | "DESTROYED";

export interface Replication {
  automatic?: {};
  userManaged?: {
    replicas: Array<{
      location: string;
      customerManagedEncryption?: {
        kmsKeyName: string;
      };
    }>;
  };
}

export interface SecretVersion {
  secret: Secret;
  versionId: string;

  // Output-only fields
  readonly state?: SecretVersionState;
  readonly createTime?: string;
}

interface CreateSecretRequest {
  name: string;
  replication: Replication;
  labels: Record<string, string>;
}

interface AddVersionRequest {
  payload: { data: string };
}

interface SecretVersionResponse {
  name: string;
  state: SecretVersionState;
  createTime: string;
}

interface AccessSecretVersionResponse {
  name: string;
  payload: {
    data: string;
  };
}

const API_VERSION = "v1";

const client = new Client({ urlPrefix: secretManagerOrigin(), apiVersion: API_VERSION });

/**
 * Returns secret resource of given name in the project.
 */
export async function getSecret(projectId: string, name: string): Promise<Secret> {
  const getRes = await client.get<WireSecret>(`projects/${projectId}/secrets/${name}`);
  const secret = parseSecretResourceName(getRes.body.name);
  secret.labels = getRes.body.labels ?? {};
  secret.replication = getRes.body.replication ?? {};
  return secret;
}

/**
 * Lists all secret resources associated with a project.
 */
export async function listSecrets(projectId: string, filter?: string): Promise<Secret[]> {
  type Response = { secrets: WireSecret[]; nextPageToken?: string };
  const secrets: Secret[] = [];
  const path = `projects/${projectId}/secrets`;
  const baseOpts = filter ? { queryParams: { filter } } : {};

  let pageToken = "";
  while (true) {
    const opts =
      pageToken === ""
        ? baseOpts
        : { ...baseOpts, queryParams: { ...baseOpts?.queryParams, pageToken } };
    const res = await client.get<Response>(path, opts);

    for (const s of res.body.secrets || []) {
      secrets.push({
        ...parseSecretResourceName(s.name),
        labels: s.labels ?? {},
        replication: s.replication ?? {},
      });
    }

    if (!res.body.nextPageToken) {
      break;
    }
    pageToken = res.body.nextPageToken;
  }
  return secrets;
}

/**
 * Retrieves a specific Secret and SecretVersion from CSM, if available.
 */
export async function getSecretMetadata(
  projectId: string,
  secretName: string,
  version: string,
): Promise<{
  secret?: Secret;
  secretVersion?: SecretVersion;
}> {
  const secretInfo: any = {};
  try {
    secretInfo.secret = await getSecret(projectId, secretName);
    secretInfo.secretVersion = await getSecretVersion(projectId, secretName, version);
  } catch (err: any) {
    // Throw anything other than the expected 404 errors.
    if (err.status !== 404) {
      throw err;
    }
  }
  return secretInfo;
}

/**
 * List all secret versions associated with a secret.
 */
export async function listSecretVersions(
  projectId: string,
  name: string,
  filter?: string,
): Promise<Required<SecretVersion[]>> {
  type Response = { versions: SecretVersionResponse[]; nextPageToken?: string };
  const secrets: Required<SecretVersion[]> = [];
  const path = `projects/${projectId}/secrets/${name}/versions`;
  const baseOpts = filter ? { queryParams: { filter } } : {};

  let pageToken = "";
  while (true) {
    const opts =
      pageToken === ""
        ? baseOpts
        : { ...baseOpts, queryParams: { ...baseOpts?.queryParams, pageToken } };
    const res = await client.get<Response>(path, opts);

    for (const s of res.body.versions || []) {
      secrets.push({
        ...parseSecretVersionResourceName(s.name),
        state: s.state,
        createTime: s.createTime,
      });
    }

    if (!res.body.nextPageToken) {
      break;
    }
    pageToken = res.body.nextPageToken;
  }
  return secrets;
}

/**
 * Returns secret version resource of given name and version in the project.
 */
export async function getSecretVersion(
  projectId: string,
  name: string,
  version: string,
): Promise<Required<SecretVersion>> {
  const getRes = await client.get<SecretVersionResponse>(
    `projects/${projectId}/secrets/${name}/versions/${version}`,
  );
  return {
    ...parseSecretVersionResourceName(getRes.body.name),
    state: getRes.body.state,
    createTime: getRes.body.createTime,
  };
}

/**
 * Access secret value of a given secret version.
 */
export async function accessSecretVersion(
  projectId: string,
  name: string,
  version: string,
): Promise<string> {
  const res = await client.get<AccessSecretVersionResponse>(
    `projects/${projectId}/secrets/${name}/versions/${version}:access`,
  );
  return Buffer.from(res.body.payload.data, "base64").toString();
}

/**
 * Change state of secret version to destroyed.
 */
export async function destroySecretVersion(
  projectId: string,
  name: string,
  version: string,
): Promise<void> {
  if (version === "latest") {
    const sv = await getSecretVersion(projectId, name, "latest");
    version = sv.versionId;
  }
  await client.post(`projects/${projectId}/secrets/${name}/versions/${version}:destroy`);
}

/**
 * Returns true if secret resource of given name exists on the project.
 */
export async function secretExists(projectId: string, name: string): Promise<boolean> {
  try {
    await getSecret(projectId, name);
    return true;
  } catch (err: any) {
    if (err.status === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Parse full secret resource name.
 */
export function parseSecretResourceName(resourceName: string): Secret {
  const match = SECRET_NAME_REGEX.exec(resourceName);
  if (!match?.groups) {
    throw new FirebaseError(`Invalid secret resource name [${resourceName}].`);
  }
  return {
    projectId: match.groups.project,
    name: match.groups.secret,
    labels: {},
    replication: {},
  };
}

/**
 * Parse full secret version resource name.
 */
export function parseSecretVersionResourceName(resourceName: string): SecretVersion {
  const match = resourceName.match(SECRET_VERSION_NAME_REGEX);
  if (!match?.groups) {
    throw new FirebaseError(`Invalid secret version resource name [${resourceName}].`);
  }
  return {
    secret: {
      projectId: match.groups.project,
      name: match.groups.secret,
      labels: {},
      replication: {},
    },
    versionId: match.groups.version,
    createTime: "",
  };
}

/**
 * Returns full secret version resource name.
 */
export function toSecretVersionResourceName(secretVersion: SecretVersion): string {
  return `projects/${secretVersion.secret.projectId}/secrets/${secretVersion.secret.name}/versions/${secretVersion.versionId}`;
}

/**
 * Creates a new secret resource.
 */
export async function createSecret(
  projectId: string,
  name: string,
  labels: Record<string, string>,
  location?: string,
): Promise<Secret> {
  let replication: CreateSecretRequest["replication"];
  if (location) {
    replication = {
      userManaged: {
        replicas: [
          {
            location,
          },
        ],
      },
    };
  } else {
    replication = { automatic: {} };
  }

  const createRes = await client.post<CreateSecretRequest, Secret>(
    `projects/${projectId}/secrets`,
    {
      name,
      replication,
      labels,
    },
    { queryParams: { secretId: name } },
  );
  return {
    ...parseSecretResourceName(createRes.body.name),
    labels,
    replication,
  };
}

/**
 * Update metadata associated with a secret.
 */
export async function patchSecret(
  projectId: string,
  name: string,
  labels: Record<string, string>,
): Promise<Secret> {
  const fullName = `projects/${projectId}/secrets/${name}`;
  const res = await client.patch<Omit<WireSecret, "replication">, WireSecret>(
    fullName,
    { name: fullName, labels },
    { queryParams: { updateMask: "labels" } }, // Only allow patching labels for now.
  );
  return {
    ...parseSecretResourceName(res.body.name),
    labels: res.body.labels,
    replication: res.body.replication,
  };
}

/**
 * Delete secret resource.
 */
export async function deleteSecret(projectId: string, name: string): Promise<void> {
  const path = `projects/${projectId}/secrets/${name}`;
  await client.delete(path);
}

/**
 * Add new version the payload as value on the given secret.
 */
export async function addVersion(
  projectId: string,
  name: string,
  payloadData: string,
): Promise<Required<SecretVersion>> {
  const res = await client.post<AddVersionRequest, { name: string; state: SecretVersionState }>(
    `projects/${projectId}/secrets/${name}:addVersion`,
    {
      payload: {
        data: Buffer.from(payloadData).toString("base64"),
      },
    },
  );
  return {
    ...parseSecretVersionResourceName(res.body.name),
    state: res.body.state,
    createTime: "",
  };
}

/**
 * Returns IAM policy of a secret resource.
 */
export async function getIamPolicy(
  secret: Pick<Secret, "projectId" | "name">,
): Promise<iam.Policy> {
  const res = await client.get<iam.Policy>(
    `projects/${secret.projectId}/secrets/${secret.name}:getIamPolicy`,
  );
  return res.body;
}

/**
 * Sets IAM policy on a secret resource.
 */
export async function setIamPolicy(
  secret: Pick<Secret, "projectId" | "name">,
  bindings: iam.Binding[],
): Promise<void> {
  await client.post<{ policy: Partial<iam.Policy>; updateMask: string }, iam.Policy>(
    `projects/${secret.projectId}/secrets/${secret.name}:setIamPolicy`,
    {
      policy: {
        bindings,
      },
      updateMask: "bindings",
    },
  );
}

/**
 * Ensure that given service agents have the given IAM role on the secret resource.
 */
export async function ensureServiceAgentRole(
  secret: Pick<Secret, "projectId" | "name">,
  serviceAccountEmails: string[],
  role: string,
): Promise<void> {
  const bindings = await checkServiceAgentRole(secret, serviceAccountEmails, role);
  if (bindings.length) {
    await module.exports.setIamPolicy(secret, bindings);
  }

  // SecretManager would like us to _always_ inform users when we grant access to one of their secrets.
  // As a safeguard against forgetting to do so, we log it here.
  logLabeledSuccess(
    "secretmanager",
    `Granted ${role} on projects/${secret.projectId}/secrets/${
      secret.name
    } to ${serviceAccountEmails.join(", ")}`,
  );
}

export async function checkServiceAgentRole(
  secret: Pick<Secret, "projectId" | "name">,
  serviceAccountEmails: string[],
  role: string,
): Promise<iam.Binding[]> {
  const policy = await module.exports.getIamPolicy(secret);
  const bindings: iam.Binding[] = policy.bindings || [];
  let binding = bindings.find((b) => b.role === role);
  if (!binding) {
    binding = { role, members: [] };
    bindings.push(binding);
  }

  let shouldShortCircuit = true;
  for (const serviceAccount of serviceAccountEmails) {
    if (!binding.members.find((m) => m === `serviceAccount:${serviceAccount}`)) {
      binding.members.push(`serviceAccount:${serviceAccount}`);
      shouldShortCircuit = false;
    }
  }

  if (shouldShortCircuit) return [];
  return bindings;
}

export const FIREBASE_MANAGED = "firebase-managed";

/**
 * Returns true if secret is managed by Cloud Functions for Firebase.
 * This used to be firebase-managed: true, but was later changed to firebase-managed: functions to
 * improve readability.
 */
export function isFunctionsManaged(secret: Secret): boolean {
  return (
    secret.labels[FIREBASE_MANAGED] === "true" || secret.labels[FIREBASE_MANAGED] === "functions"
  );
}

/**
 * Returns true if secret is managed by Firebase App Hosting.
 */
export function isAppHostingManaged(secret: Secret): boolean {
  return secret.labels[FIREBASE_MANAGED] === "apphosting";
}

/**
 * Utility used in the "before" command annotation to enable the API.
 */

export function ensureApi(options: any): Promise<void> {
  const projectId = needProjectId(options);
  return ensureApiEnabled.ensure(projectId, secretManagerOrigin(), "secretmanager", true);
}
/**
 * Return labels to mark secret as managed by Firebase.
 * @internal
 */

export function labels(product: "functions" | "apphosting" = "functions"): Record<string, string> {
  return { [FIREBASE_MANAGED]: product };
}
