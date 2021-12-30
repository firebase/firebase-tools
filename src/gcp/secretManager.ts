import * as iam from "./iam";

import { logLabeledSuccess } from "../utils";
import { FirebaseError } from "../error";
import { Client } from "../apiv2";
import { secretManagerOrigin } from "../api";

// Matches projects/{PROJECT}/secrets/{SECRET}
const SECRET_NAME_REGEX = new RegExp(
  "projects\\/" +
    "((?:[0-9]+)|(?:[A-Za-z]+[A-Za-z\\d-]*[A-Za-z\\d]?))\\/" +
    "secrets\\/" +
    "([A-Za-z\\d\\-_]+)"
);

// Matches projects/{PROJECT}/secrets/{SECRET}/versions/{latest|VERSION}
const SECRET_VERSION_NAME_REGEX = new RegExp(
  SECRET_NAME_REGEX.source + "\\/versions\\/" + "(latest|[0-9]+)"
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

export interface SecretVersion {
  secret: Secret;
  version: string;
}

interface CreateSecretRequest {
  replication: { automatic: {} };
  labels: Record<string, string>;
}

interface AddVersionRequest {
  payload: { data: string };
}

const API_VERSION = "v1beta1";

const client = new Client({
  urlPrefix: secretManagerOrigin,
  auth: true,
  apiVersion: API_VERSION,
});

export async function listSecrets(projectId: string): Promise<Secret[]> {
  const listRes = await client.get<{ secrets: Secret[] }>(`projects/${projectId}/secrets`);
  return listRes.body.secrets.map((s: any) => parseSecretResourceName(s.name));
}

export async function getSecret(projectId: string, name: string): Promise<Secret> {
  const getRes = await client.get<Secret>(`projects/${projectId}/secrets/${name}`);
  const secret = parseSecretResourceName(getRes.body.name);
  secret.labels = getRes.body.labels ?? {};
  return secret;
}

export async function getSecretVersion(
  projectId: string,
  name: string,
  version: string
): Promise<SecretVersion> {
  const getRes = await client.get<{ name: string }>(
    `projects/${projectId}/secrets/${name}/versions/${version}`
  );
  return parseSecretVersionResourceName(getRes.body.name);
}

export async function secretExists(projectId: string, name: string): Promise<boolean> {
  try {
    await getSecret(projectId, name);
    return true;
  } catch (err) {
    if (err.status === 404) {
      return false;
    }
    throw err;
  }
}

export function parseSecretResourceName(resourceName: string): Secret {
  const tokens = resourceName.match(SECRET_NAME_REGEX);
  if (tokens == null) {
    throw new FirebaseError(`Invalid secret resource name [${resourceName}].`);
  }
  return {
    projectId: tokens[1],
    name: tokens[2],
  };
}

export function parseSecretVersionResourceName(resourceName: string): SecretVersion {
  const tokens = resourceName.match(SECRET_VERSION_NAME_REGEX);
  if (tokens == null) {
    throw new FirebaseError(`Invalid secret version resource name [${resourceName}].`);
  }
  return {
    secret: {
      projectId: tokens[1],
      name: tokens[2],
    },
    version: tokens[3],
  };
}

export function toSecretVersionResourceName(secretVersion: SecretVersion): string {
  return `projects/${secretVersion.secret.projectId}/secrets/${secretVersion.secret.name}/versions/${secretVersion.version}`;
}

export async function createSecret(
  projectId: string,
  name: string,
  labels: Record<string, string>
): Promise<Secret> {
  const createRes = await client.post<CreateSecretRequest, Secret>(
    `projects/${projectId}/secrets?secretId=${name}`,
    {
      replication: {
        automatic: {},
      },
      labels,
    }
  );
  return parseSecretResourceName(createRes.body.name);
}

export async function addVersion(secret: Secret, payloadData: string): Promise<SecretVersion> {
  const res = await client.post<AddVersionRequest, { name: string }>(
    `projects/${secret.projectId}/secrets/${secret.name}:addVersion`,
    {
      payload: {
        data: Buffer.from(payloadData).toString("base64"),
      },
    }
  );
  return parseSecretVersionResourceName(res.body.name);
}

export async function getIamPolicy(secret: Secret): Promise<iam.Policy> {
  const res = await client.get<iam.Policy>(
    `projects/${secret.projectId}/secrets/${secret.name}:getIamPolicy`
  );
  return res.body;
}

export async function setIamPolicyBindings(secret: Secret, bindings: iam.Binding[]): Promise<void> {
  await client.post<{ policy: Partial<iam.Policy> }, iam.Policy>(
    `projects/${secret.projectId}/secrets/${secret.name}:setIamPolicy`,
    {
      policy: {
        bindings,
      },
    },
    {
      queryParams: {
        updateMask: "bindings",
      },
    }
  );
}

export async function ensureServiceAgentRole(
  secret: Secret,
  serviceAccountEmails: string[],
  role: string
): Promise<void> {
  const policy = await module.exports.getIamPolicy(secret);
  const bindings = policy.bindings || [];

  const newBindings = [];
  for (const serviceAccountEmail of serviceAccountEmails) {
    if (
      !bindings.find(
        (b: iam.Binding) =>
          b.role == role &&
          b.members.find((m: string) => m == `serviceAccount:${serviceAccountEmail}`)
      )
    ) {
      newBindings.push({
        role: role,
        members: [`serviceAccount:${serviceAccountEmail}`],
      });
    }
  }

  if (newBindings.length == 0) {
    // bindings already exist, short-circuit.
    return;
  }

  bindings.push(...newBindings);

  await module.exports.setIamPolicyBindings(secret, bindings);

  // SecretManager would like us to _always_ inform users when we grant access to one of their secrets.
  // As a safeguard against forgetting to do so, we log it here.
  logLabeledSuccess(
    "secretmanager",
    `Granted ${role} on projects/${secret.projectId}/secrets/${
      secret.name
    } to ${serviceAccountEmails.join(", ")}`
  );
}
