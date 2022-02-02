import { logLabeledSuccess } from "../utils";
import { secretManagerOrigin } from "../api";
import { Client } from "../apiv2";

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
  versionId: string;
}

const apiClient = new Client({ urlPrefix: secretManagerOrigin, apiVersion: "v1beta1" });

export async function listSecrets(projectId: string): Promise<Secret[]> {
  const listRes = await apiClient.get<{ secrets: any[] }>(`/projects/${projectId}/secrets`);
  return listRes.body.secrets.map((s) => parseSecretResourceName(s.name));
}

export async function getSecret(projectId: string, name: string): Promise<Secret> {
  const getRes = await apiClient.get<{ name: string; labels: Record<string, string> }>(
    `/projects/${projectId}/secrets/${name}`
  );
  const secret = parseSecretResourceName(getRes.body.name);
  secret.labels = getRes.body.labels ?? {};
  return secret;
}

export async function getSecretVersion(
  projectId: string,
  name: string,
  version: string
): Promise<SecretVersion> {
  const getRes = await apiClient.get<{ name: string }>(
    `/projects/${projectId}/secrets/${name}/versions/${version}`
  );
  return parseSecretVersionResourceName(getRes.body.name);
}

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

export function parseSecretResourceName(resourceName: string): Secret {
  const nameTokens = resourceName.split("/");
  return {
    projectId: nameTokens[1],
    name: nameTokens[3],
  };
}

export function parseSecretVersionResourceName(resourceName: string): SecretVersion {
  const nameTokens = resourceName.split("/");
  return {
    secret: {
      projectId: nameTokens[1],
      name: nameTokens[3],
    },
    versionId: nameTokens[5],
  };
}

export function toSecretVersionResourceName(secretVersion: SecretVersion): string {
  return `projects/${secretVersion.secret.projectId}/secrets/${secretVersion.secret.name}/versions/${secretVersion.versionId}`;
}

export async function createSecret(
  projectId: string,
  name: string,
  labels: Record<string, string>
): Promise<Secret> {
  const createRes = await apiClient.post<
    { replication: { automatic: {} }; labels: Record<string, string> },
    { name: string }
  >(
    `/projects/${projectId}/secrets`,
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

export async function addVersion(secret: Secret, payloadData: string): Promise<SecretVersion> {
  const res = await apiClient.post<{ payload: { data: string } }, { name: string }>(
    `/projects/${secret.projectId}/secrets/${secret.name}:addVersion`,
    {
      payload: {
        data: Buffer.from(payloadData).toString("base64"),
      },
    }
  );
  const nameTokens = res.body.name.split("/");
  return {
    secret: {
      projectId: nameTokens[1],
      name: nameTokens[3],
    },
    versionId: nameTokens[5],
  };
}

export async function grantServiceAgentRole(
  secret: Secret,
  serviceAccountEmail: string,
  role: string
): Promise<void> {
  const getPolicyRes = await apiClient.get<{ bindings: any[] }>(
    `/projects/${secret.projectId}/secrets/${secret.name}:getIamPolicy`
  );

  const bindings = getPolicyRes.body.bindings || [];
  if (
    bindings.find(
      (b: any) =>
        b.role == role &&
        b.members.find((m: string) => m == `serviceAccount:${serviceAccountEmail}`)
    )
  ) {
    // binding already exists, short-circuit.
    return;
  }
  bindings.push({
    role: role,
    members: [`serviceAccount:${serviceAccountEmail}`],
  });
  await apiClient.post<{ policy: { bindings: unknown }; updateMask: { paths: string } }, void>(
    `/projects/${secret.projectId}/secrets/${secret.name}:setIamPolicy`,
    {
      policy: {
        bindings,
      },
      updateMask: {
        paths: "bindings",
      },
    }
  );
  // SecretManager would like us to _always_ inform users when we grant access to one of their secrets.
  // As a safeguard against forgetting to do so, we log it here.
  logLabeledSuccess(
    "SecretManager",
    `Granted ${role} on projects/${secret.projectId}/secrets/${secret.name} to ${serviceAccountEmail}`
  );
}
