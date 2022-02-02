import * as iam from "./iam";

import { logLabeledSuccess } from "../utils";
import { FirebaseError } from "../error";
import { Client } from "../apiv2";
import { secretManagerOrigin } from "../api";

// Matches projects/{PROJECT}/secrets/{SECRET}
const SECRET_NAME_REGEX = new RegExp(
  "projects\\/" +
    "(?<project>(?:\\d+)|(?:[A-Za-z]+[A-Za-z\\d-]*[A-Za-z\\d]?))\\/" +
    "secrets\\/" +
    "(?<secret>[A-Za-z\\d\\-_]+)"
);

// Matches projects/{PROJECT}/secrets/{SECRET}/versions/{latest|VERSION}
const SECRET_VERSION_NAME_REGEX = new RegExp(
  SECRET_NAME_REGEX.source + "\\/versions\\/" + "(?<version>latest|[0-9]+)"
);

export const secretManagerConsoleUri = (projectId: string) =>
  `https://console.cloud.google.com/security/secret-manager?project=${projectId}`;
export interface Secret {
  // Secret name/label (this is not resource name)
  name: string;
  // This is either projectID or number
  projectId: string;
  labels?: Record<string, string>;
}

type SecretVersionState = "STATE_UNSPECIFIED" | "ENABLED" | "DISABLED" | "DESTROYED";

export interface SecretVersion {
  secret: Secret;
  versionId: string;

  // Output-only fields
  readonly state?: SecretVersionState;
}

interface CreateSecretRequest {
  replication: { automatic: {} };
  labels: Record<string, string>;
}

interface AddVersionRequest {
  payload: { data: string };
}

const API_VERSION = "v1beta1";

const client = new Client({ urlPrefix: secretManagerOrigin, apiVersion: API_VERSION });

/**
 * Returns all secret resources of given project.
 */
export async function listSecrets(projectId: string): Promise<Secret[]> {
  const listRes = await client.get<{ secrets: Secret[] }>(`projects/${projectId}/secrets`);
  return listRes.body.secrets.map((s: any) => parseSecretResourceName(s.name));
}

/**
 * Returns secret resource of given name in the project.
 */
export async function getSecret(projectId: string, name: string): Promise<Secret> {
  const getRes = await client.get<Secret>(`projects/${projectId}/secrets/${name}`);
  const secret = parseSecretResourceName(getRes.body.name);
  secret.labels = getRes.body.labels ?? {};
  return secret;
}

/**
 * Returns secret version resource of given name and version in the project.
 */
export async function getSecretVersion(
  projectId: string,
  name: string,
  version: string
): Promise<Required<SecretVersion>> {
  const getRes = await client.get<{ name: string; state: SecretVersionState }>(
    `projects/${projectId}/secrets/${name}/versions/${version}`
  );
  return {
    ...parseSecretVersionResourceName(getRes.body.name),
    state: getRes.body.state,
  };
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
    },
    versionId: match.groups.version,
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
  labels: Record<string, string>
): Promise<Secret> {
  const createRes = await client.post<CreateSecretRequest, Secret>(
    `projects/${projectId}/secrets`,
    {
      replication: {
        automatic: {},
      },
      labels,
    },
    { queryParams: { secretId: name } }
  );
  return parseSecretResourceName(createRes.body.name);
}

/**
 * Add new version the payload as value on the given secret.
 */
export async function addVersion(
  projectId: string,
  name: string,
  payloadData: string
): Promise<Required<SecretVersion>> {
  const res = await client.post<AddVersionRequest, { name: string; state: SecretVersionState }>(
    `projects/${secret.projectId}/secrets/${secret.name}:addVersion`,
    {
      payload: {
        data: Buffer.from(payloadData).toString("base64"),
      },
    }
  );
  return {
    ...parseSecretVersionResourceName(res.body.name),
    state: res.body.state,
  };
}

/**
 * Returns IAM policy of a secret resource.
 */
export async function getIamPolicy(secret: Secret): Promise<iam.Policy> {
  const res = await client.get<iam.Policy>(
    `projects/${secret.projectId}/secrets/${secret.name}:getIamPolicy`
  );
  return res.body;
}

/**
 * Sets IAM policy on a secret resource.
 */
export async function setIamPolicy(secret: Secret, bindings: iam.Binding[]): Promise<void> {
  await client.post<{ policy: Partial<iam.Policy>; updateMask: string }, iam.Policy>(
    `projects/${secret.projectId}/secrets/${secret.name}:setIamPolicy`,
    {
      policy: {
        bindings,
      },
      updateMask: "bindings",
    }
  );
}

/**
 * Ensure that given service agents have the given IAM role on the secret resource.
 */
export async function ensureServiceAgentRole(
  secret: Secret,
  serviceAccountEmails: string[],
  role: string
): Promise<void> {
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

  if (shouldShortCircuit) return;

  await module.exports.setIamPolicy(secret, bindings);

  // SecretManager would like us to _always_ inform users when we grant access to one of their secrets.
  // As a safeguard against forgetting to do so, we log it here.
  logLabeledSuccess(
    "secretmanager",
    `Granted ${role} on projects/${secret.projectId}/secrets/${
      secret.name
    } to ${serviceAccountEmails.join(", ")}`
  );
}
