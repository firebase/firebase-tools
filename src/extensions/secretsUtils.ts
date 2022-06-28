/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { getProjectNumber } from "../getProjectNumber";
import * as utils from "../utils";
import { ensure } from "../ensureApiEnabled";
import { needProjectId } from "../projectUtils";
import { ExtensionInstance, ExtensionSpec, ParamType } from "./types";
import * as secretManagerApi from "../gcp/secretManager";
import { logger } from "../logger";

export const SECRET_LABEL = "firebase-extensions-managed";

export async function ensureSecretManagerApiEnabled(options: any): Promise<void> {
  const projectId = needProjectId(options);
  return await ensure(projectId, "secretmanager.googleapis.com", "extensions", options.markdown);
}

export function usesSecrets(spec: ExtensionSpec): boolean {
  return spec.params && !!spec.params.find((p) => p.type === ParamType.SECRET);
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

  return secretManagerApi.ensureServiceAgentRole(secret, [saEmail], "roles/secretmanager.admin");
}

export async function getManagedSecrets(instance: ExtensionInstance): Promise<string[]> {
  return (
    await Promise.all(
      getActiveSecrets(instance.config.source.spec, instance.config.params).map(
        async (secretResourceName) => {
          const secret = secretManagerApi.parseSecretResourceName(secretResourceName);
          const labels = (await secretManagerApi.getSecret(secret.projectId, secret.name)).labels;
          if (labels && labels[SECRET_LABEL]) {
            return secretResourceName;
          }
          return Promise.resolve("");
        }
      )
    )
  ).filter((secretId) => !!secretId);
}

export function getActiveSecrets(spec: ExtensionSpec, params: Record<string, string>): string[] {
  return spec.params
    .map((p) => (p.type === ParamType.SECRET ? params[p.param] : ""))
    .filter((pv) => !!pv);
}

export function getSecretLabels(instanceId: string): Record<string, string> {
  const labels: Record<string, string> = {};
  labels[SECRET_LABEL] = instanceId;
  return labels;
}

export function prettySecretName(secretResourceName: string): string {
  const nameTokens = secretResourceName.split("/");
  if (nameTokens.length !== 4 && nameTokens.length !== 6) {
    // not a familiar format, return as is
    logger.debug(`unable to parse secret secretResourceName: ${secretResourceName}`);
    return secretResourceName;
  }
  return nameTokens.slice(0, 4).join("/");
}
