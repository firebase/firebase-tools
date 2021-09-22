import * as api from "../api";
import { getProjectNumber } from "../getProjectNumber";
import * as utils from "../utils";

export interface Secret {
  // Secret name/label (this is not resource name)
  name: string;
  // This is either projectID or number
  projectId: string;
}

export interface SecretVersion {
  secret: Secret;
  versionId: string;
}

export async function listSecrets(projectId: string): Promise<Secret[]> {
  const listRes = await api.request("GET", `/v1beta1/projects/${projectId}/secrets`, {
    auth: true,
    origin: api.secretManagerOrigin,
  });
  return listRes.body.secrets.map((s: any) => parseSecret(s.name));
}

export async function getSecret(projectId: string, name: string): Promise<Secret> {
  const getRes = await api.request("GET", `/v1beta1/projects/${projectId}/secrets/${name}`, {
    auth: true,
    origin: api.secretManagerOrigin,
  });
  return parseSecret(getRes.body.name);
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

function parseSecret(resourceName: string): Secret {
  const nameTokens = resourceName.split("/");
  return {
    projectId: nameTokens[1],
    name: nameTokens[3],
  };
}

export async function createSecret(projectId: string, name: string): Promise<Secret> {
  const createRes = await api.request(
    "POST",
    `/v1beta1/projects/${projectId}/secrets?secretId=${name}`,
    {
      auth: true,
      origin: api.secretManagerOrigin,
      data: {
        replication: {
          automatic: {},
        },
      },
    }
  );
  return parseSecret(createRes.body.name);
}

export async function addVersion(secret: Secret, payloadData: string): Promise<SecretVersion> {
  const res = await api.request(
    "POST",
    `/v1beta1/projects/${secret.projectId}/secrets/${secret.name}:addVersion`,
    {
      auth: true,
      origin: api.secretManagerOrigin,
      data: {
        payload: {
          data: Buffer.from(payloadData).toString("base64"),
        },
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

export async function grantFirexServiceAgentSecretAdminRole(secret: Secret): Promise<void> {
  const getPolicyRes = await api.request(
    "GET",
    `/v1beta1/projects/${secret.projectId}/secrets/${secret.name}:getIamPolicy`,
    {
      auth: true,
      origin: api.secretManagerOrigin,
    }
  );
  const projectNumber = await getProjectNumber({ projectId: secret.projectId });
  const firexSaProjectId = utils.envOverride("FIREX_SA_PROJECT_ID", "gcp-sa-firebasemods");
  const saEmail = `service-${projectNumber}@${firexSaProjectId}.iam.gserviceaccount.com`;

  const bindings = getPolicyRes.body.bindings;
  if (
    bindings.findIndex(
      (b: any) =>
        b.role == "roles/secretmanager.admin" &&
        b.members.find((m: string) => m == `serviceAccount:${saEmail}`)
    ) > -1
  ) {
    // binding already exists, short-circuit.
    return;
  }
  bindings.push({
    role: "roles/secretmanager.admin",
    members: [`serviceAccount:${saEmail}`],
  });

  await api.request(
    "POST",
    `/v1beta1/projects/${secret.projectId}/secrets/${secret.name}:setIamPolicy`,
    {
      auth: true,
      origin: api.secretManagerOrigin,
      data: {
        policy: {
          bindings,
        },
        updateMask: {
          paths: "bindings",
        },
      },
    }
  );
}
