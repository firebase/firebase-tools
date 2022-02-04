import * as utils from "../utils";
import * as poller from "../operation-poller";
import * as gcf from "../gcp/cloudfunctions";
import * as backend from "../deploy/functions/backend";
import {
  createSecret,
  destroySecretVersion,
  getSecret,
  getSecretVersion,
  listSecrets,
  listSecretVersions,
  parseSecretResourceName,
  patchSecret,
  Secret,
} from "../gcp/secretManager";
import { Options } from "../options";
import { FirebaseError } from "../error";
import { logWarning } from "../utils";
import { promptOnce } from "../prompt";
import { validateKey } from "./env";
import { needProjectNumber } from "../projectUtils";
import { logger } from "../logger";
import { functionsOrigin } from "../api";
import { assertExhaustive } from "../functional";

const FIREBASE_MANGED = "firebase-managed";

type ProjectInfo = {
  projectId: string;
  projectNumber: string;
};

/**
 * Returns true if secret is managed by Firebase.
 */
export function isFirebaseManaged(secret: Secret): boolean {
  return Object.keys(secret.labels || []).includes(FIREBASE_MANGED);
}

/**
 * Return labels to mark secret as managed by Firebase.
 * @internal
 */
export function labels(): Record<string, string> {
  return { [FIREBASE_MANGED]: "true" };
}

function toUpperSnakeCase(key: string): string {
  return key
    .replace("-", "_")
    .replace(".", "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toUpperCase();
}

/**
 * Validate and transform keys to match the convention recommended by Firebase.
 */
export async function ensureValidKey(key: string, options: Options): Promise<string> {
  const transformedKey = toUpperSnakeCase(key);
  if (transformedKey !== key) {
    if (options.force) {
      throw new FirebaseError("Secret key must be in UPPER_SNAKE_CASE.");
    }
    logWarning(`By convention, secret key must be in UPPER_SNAKE_CASE.`);
    const confirm = await promptOnce(
      {
        name: "updateKey",
        type: "confirm",
        default: true,
        message: `Would you like to use ${transformedKey} as key instead?`,
      },
      options
    );
    if (!confirm) {
      throw new FirebaseError("Secret key must be in UPPER_SNAKE_CASE.");
    }
  }
  try {
    validateKey(transformedKey);
  } catch (err: any) {
    throw new FirebaseError(`Invalid secret key ${transformedKey}`, { children: [err] });
  }
  return transformedKey;
}

/**
 * Ensure secret exists. Optionally prompt user to have non-Firebase managed keys be managed by Firebase.
 */
export async function ensureSecret(
  projectId: string,
  name: string,
  options: Options
): Promise<Secret> {
  try {
    const secret = await getSecret(projectId, name);
    if (!isFirebaseManaged(secret)) {
      if (!options.force) {
        logWarning(
          "Your secret is not managed by Firebase. " +
            "Firebase managed secrets are automatically pruned to reduce your monthly cost for using Secret Manager. "
        );
        const confirm = await promptOnce(
          {
            name: "updateLabels",
            type: "confirm",
            default: true,
            message: `Would you like to have your secret ${secret.name} managed by Firebase?`,
          },
          options
        );
        if (confirm) {
          return patchSecret(projectId, secret.name, {
            ...secret.labels,
            ...labels(),
          });
        }
      }
    }
    return secret;
  } catch (err: any) {
    if (err.status !== 404) {
      throw err;
    }
  }
  return await createSecret(projectId, name, labels());
}

/**
 * Collects all secret environment variables of endpoints.
 */
export function of(endpoints: backend.Endpoint[]): backend.SecretEnvVar[] {
  return endpoints.reduce(
    (envs, endpoint) => [...envs, ...(endpoint.secretEnvironmentVariables || [])],
    [] as backend.SecretEnvVar[]
  );
}

/**
 * Returns all secret versions from Firebase managed secrets unused in the given list of endpoints.
 */
export async function pruneSecrets(
  projectInfo: ProjectInfo,
  endpoints: backend.Endpoint[]
): Promise<Required<backend.SecretEnvVar>[]> {
  const { projectId, projectNumber } = projectInfo;
  const pruneKey = (name: string, version: string) => `${name}@${version}`;
  const prunedSecrets: Set<string> = new Set();

  // Collect all Firebase managed secret versions
  const haveSecrets = await listSecrets(projectId, `labels.${FIREBASE_MANGED}=true`);
  for (const secret of haveSecrets) {
    const versions = await listSecretVersions(projectId, secret.name, `state: ENABLED`);
    for (const version of versions) {
      prunedSecrets.add(pruneKey(secret.name, version.versionId));
    }
  }

  // Prune all project-scoped secrets in use.
  const secrets: Required<backend.SecretEnvVar>[] = [];
  for (const secret of of(endpoints)) {
    if (secret.projectId === projectId || secret.projectId === projectNumber) {
      if (secret.version) {
        // I'm not sure why TS can't infer that version will not be empty in this block.
        secrets.push({ ...secret, version: secret.version });
      }
    }
  }

  for (const sev of secrets) {
    let name = sev.secret;
    if (name.includes("/")) {
      const secret = parseSecretResourceName(name);
      name = secret.name;
    }

    let version = sev.version;
    if (version === "latest") {
      // We need to figure out what "latest" resolves to.
      const resolved = await getSecretVersion(projectId, name, version);
      version = resolved.versionId;
    }

    prunedSecrets.delete(pruneKey(name, version));
  }

  return Array.from(prunedSecrets)
    .map((key) => key.split("@"))
    .map(([secret, version]) => ({ projectId, version, secret, key: secret }));
}

type PruneResult = {
  destroyed: backend.SecretEnvVar[];
  erred: { message: string }[];
};

/**
 * Prune and destroy all unused secret versions. Only Firebase managed secrets will be scanned.
 */
export async function pruneAndDestroySecrets(
  projectInfo: ProjectInfo,
  endpoints: backend.Endpoint[]
): Promise<PruneResult> {
  const destroyed: PruneResult["destroyed"] = [];
  const erred: PruneResult["erred"] = [];

  const { projectId, projectNumber } = projectInfo;
  logger.debug("Pruning secrets to find unused secret versions...");
  const unusedSecrets = await pruneSecrets({ projectId, projectNumber }, endpoints);

  if (unusedSecrets.length === 0) {
    return { destroyed, erred };
  }

  const msg = unusedSecrets.map((s) => `${s.secret}@${s.version}`);
  logger.debug(`Found unused secret versions: ${msg}. Destroying them...`);
  const destroyResults = await utils.allSettled(
    unusedSecrets.map(async (sev) => {
      await destroySecretVersion(sev.projectId, sev.secret, sev.version);
      return sev;
    })
  );

  for (const result of destroyResults) {
    if (result.status === "fulfilled") {
      destroyed.push(result.value);
    } else {
      erred.push(result.reason as { message: string });
    }
  }
  return { destroyed, erred };
}

/**
 * Checks where a secret is in use by the given endpoint.
 */
export function inUse(projectInfo: ProjectInfo, secret: Secret, endpoint: backend.Endpoint) {
  const { projectNumber } = projectInfo;
  for (const sev of of([endpoint])) {
    if (
      (sev.projectId === endpoint.project || sev.projectId === projectNumber) &&
      sev.secret === secret.name
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Updates given endpoint to use the given secret version.
 */
export async function updateEndpointSecret(
  secret: Secret,
  endpoint: backend.Endpoint
): Promise<backend.Endpoint> {
  const sv = await getSecretVersion(secret.projectId, secret.name, "latest");
  const projectNumber = await needProjectNumber({ projectId: endpoint.project });
  const newSecrets: Required<backend.SecretEnvVar>[] = [];
  for (const secret of of([endpoint])) {
    const newSecret = { ...secret };
    if (
      (newSecret.projectId === endpoint.project || newSecret.projectId === projectNumber) &&
      newSecret.secret == sv.secret.name
    ) {
      newSecret.version = sv.versionId;
    }
    newSecrets.push(newSecret as Required<backend.SecretEnvVar>);
  }

  if (endpoint.platform === "gcfv1") {
    const fn = gcf.functionFromEndpoint(endpoint, "");
    const op = await gcf.updateFunction({
      name: fn.name,
      runtime: fn.runtime,
      entryPoint: fn.entryPoint,
      secretEnvironmentVariables: newSecrets,
    });
    const cfn = await poller.pollOperation<gcf.CloudFunction>({
      apiOrigin: functionsOrigin,
      // For some reason, gcf.API_VERSION is undefined when fabricator.gcfV1PollerOptions is imported.
      // Possibly due to cyclical dependency? Copying the option in verbatim instead.
      apiVersion: gcf.API_VERSION,
      masterTimeout: 25 * 60 * 1_000, // 25 minutes is the maximum build time for a function
      maxBackoff: 10_000,
      pollerName: `update-${endpoint.region}-${endpoint.id}`,
      operationResourceName: op.name,
    });
    return gcf.endpointFromFunction(cfn);
  } else if (endpoint.platform === "gcfv2") {
    // TODO add support for updating secrets in v2 functions once it's supported
    throw new FirebaseError(`Unsupported platform ${endpoint.platform}`);
  } else {
    assertExhaustive(endpoint.platform);
  }
}
