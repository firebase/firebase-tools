import { getProjectNumber } from "../getProjectNumber";
import * as utils from "../utils";
import { ensure } from "../ensureApiEnabled";
import { needProjectId } from "../projectUtils";
import * as extensionsApi from "./extensionsApi";
import * as secretManagerApi from "../gcp/secretManager";
import { logger } from "../logger";

const SECRET_LABEL = "firebase-extensions-managed";

export async function ensureSecretManagerApiEnabled(options: any): Promise<void> {
  const projectId = needProjectId(options);
  return await ensure(projectId, "secretmanager.googleapis.com", "extensions", options.markdown);
}

export function usesSecrets(spec: extensionsApi.ExtensionSpec): boolean {
  return spec.params && !!spec.params.find((p) => p.type == extensionsApi.ParamType.SECRET);
}

export async function grantFirexServiceAgentSecretAdminRole(
  secret: secretManagerApi.Secret
): Promise<void> {
  const projectNumber = await getProjectNumber({ projectId: secret.projectId });
  const firexSaProjectId = utils.envOverride(
    "FIREBASE_EXTENSIONS_SA_PROJECT_ID",
    "gcp-sa-firebasemods"
  );
  const saEmail = `service-${projectNumber}@${firexSaProjectId}.iam.gserviceaccount.com`;

  return secretManagerApi.grantServiceAgentRole(secret, saEmail, "roles/secretmanager.admin");
}

export async function getManagedSecrets(
  instance: extensionsApi.ExtensionInstance
): Promise<string[]> {
  return (
    await Promise.all(
      getActiveSecrets(instance).map(async (secretResourceName) => {
        const secret = secretManagerApi.parseSecretResourceName(secretResourceName);
        const labels = await secretManagerApi.getSecretLabels(secret.projectId, secret.name);
        if (labels && labels[SECRET_LABEL]) {
          return secretResourceName;
        }
        return Promise.resolve("");
      })
    )
  ).filter((secretId) => !!secretId);
}

function getActiveSecrets(instance: extensionsApi.ExtensionInstance): string[] {
  return instance.config.source.spec.params
    .map((p) => p.type == extensionsApi.ParamType.SECRET && instance.config.params[p.param])
    .filter((pv) => !!pv);
}

export function getSecretLabels(instanceId: string): Record<string, string> {
  const labels: Record<string, string> = {};
  labels[SECRET_LABEL] = instanceId;
  return labels;
}

export function prettySecretName(secretResourceName: string): string {
  const nameTokens = secretResourceName.split("/");
  if (nameTokens.length != 4 && nameTokens.length != 6) {
    // not a familiar format, return as is
    logger.debug(`unable to parse secret secretResourceName: ${secretResourceName}`);
    return secretResourceName;
  }
  return nameTokens.slice(0, 4).join("/");
}
