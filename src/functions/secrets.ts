import * as utils from "../utils";
import * as poller from "../operation-poller";
import * as gcfV1 from "../gcp/cloudfunctions";
import * as gcfV2 from "../gcp/cloudfunctionsv2";
import * as backend from "../deploy/functions/backend";
import * as ensureApiEnabled from "../ensureApiEnabled";
import { functionsOrigin, functionsV2Origin } from "../api";
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
  SecretVersion,
} from "../gcp/secretManager";
import { Options } from "../options";
import { FirebaseError } from "../error";
import { logWarning } from "../utils";
import { promptOnce } from "../prompt";
import { validateKey } from "./env";
import { logger } from "../logger";
import { assertExhaustive } from "../functional";
import { needProjectId } from "../projectUtils";

const FIREBASE_MANAGED = "firebase-managed";

// For mysterious reasons, importing the poller option in fabricator.ts leads to some
// value of the poller option to be undefined at runtime. I can't figure out what's going on,
// but don't have time to find out. Taking a shortcut and copying the values directly in
// violation of DRY. Sorry!
const gcfV1PollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: functionsOrigin,
  apiVersion: "v1",
  masterTimeout: 25 * 60 * 1_000, // 25 minutes is the maximum build time for a function
  maxBackoff: 10_000,
};

const gcfV2PollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: functionsV2Origin,
  apiVersion: "v2",
  masterTimeout: 25 * 60 * 1_000, // 25 minutes is the maximum build time for a function
  maxBackoff: 10_000,
};

type ProjectInfo = {
  projectId: string;
  projectNumber: string;
};

/**
 * Returns true if secret is managed by Firebase.
 */
export function isFirebaseManaged(secret: Secret): boolean {
  return Object.keys(secret.labels || []).includes(FIREBASE_MANAGED);
}

/**
 * Return labels to mark secret as managed by Firebase.
 * @internal
 */
export function labels(): Record<string, string> {
  return { [FIREBASE_MANAGED]: "true" };
}

function toUpperSnakeCase(key: string): string {
  return key
    .replace(/[.-]/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toUpperCase();
}

/**
 * Utility used in the "before" command annotation to enable the API.
 */
export function ensureApi(options: any): Promise<void> {
  const projectId = needProjectId(options);
  return ensureApiEnabled.ensure(projectId, "secretmanager.googleapis.com", "secretmanager", true);
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
      options,
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
  options: Options,
): Promise<Secret> {
  try {
    const secret = await getSecret(projectId, name);
    if (!isFirebaseManaged(secret)) {
      if (!options.force) {
        logWarning(
          "Your secret is not managed by Firebase. " +
            "Firebase managed secrets are automatically pruned to reduce your monthly cost for using Secret Manager. ",
        );
        const confirm = await promptOnce(
          {
            name: "updateLabels",
            type: "confirm",
            default: true,
            message: `Would you like to have your secret ${secret.name} managed by Firebase?`,
          },
          options,
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
    [] as backend.SecretEnvVar[],
  );
}

/**
 * Generates an object mapping secret's with their versions.
 */
export function getSecretVersions(endpoint: backend.Endpoint): Record<string, string> {
  return (endpoint.secretEnvironmentVariables || []).reduce(
    (memo, { secret, version }) => {
      memo[secret] = version || "";
      return memo;
    },
    {} as Record<string, string>,
  );
}

/**
 * Checks whether a secret is in use by the given endpoint.
 */
export function inUse(projectInfo: ProjectInfo, secret: Secret, endpoint: backend.Endpoint) {
  const { projectId, projectNumber } = projectInfo;
  for (const sev of of([endpoint])) {
    if (
      (sev.projectId === projectId || sev.projectId === projectNumber) &&
      sev.secret === secret.name
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a secret version in use by the given endpoint.
 */
export function versionInUse(
  projectInfo: ProjectInfo,
  sv: SecretVersion,
  endpoint: backend.Endpoint,
): boolean {
  const { projectId, projectNumber } = projectInfo;
  for (const sev of of([endpoint])) {
    if (
      (sev.projectId === projectId || sev.projectId === projectNumber) &&
      sev.secret === sv.secret.name &&
      sev.version === sv.versionId
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Returns all secret versions from Firebase managed secrets unused in the given list of endpoints.
 */
export async function pruneSecrets(
  projectInfo: ProjectInfo,
  endpoints: backend.Endpoint[],
): Promise<Required<backend.SecretEnvVar>[]> {
  const { projectId, projectNumber } = projectInfo;
  const pruneKey = (name: string, version: string) => `${name}@${version}`;
  const prunedSecrets: Set<string> = new Set();

  // Collect all Firebase managed secret versions
  const haveSecrets = await listSecrets(projectId, `labels.${FIREBASE_MANAGED}=true`);
  for (const secret of haveSecrets) {
    const versions = await listSecretVersions(projectId, secret.name, `NOT state: DESTROYED`);
    for (const version of versions) {
      prunedSecrets.add(pruneKey(secret.name, version.versionId));
    }
  }

  // Prune all project-scoped secrets in use.
  const secrets: Required<backend.SecretEnvVar>[] = [];
  for (const secret of of(endpoints)) {
    if (!secret.version) {
      // All bets are off if secret version isn't available in the endpoint definition.
      // This should never happen for GCFv1 instances.
      throw new FirebaseError(`Secret ${secret.secret} version is unexpectedly empty.`);
    }
    if (secret.projectId === projectId || secret.projectId === projectNumber) {
      // We already know that secret.version isn't empty, but TS can't figure it out for some reason.
      if (secret.version) {
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
  endpoints: backend.Endpoint[],
): Promise<PruneResult> {
  const { projectId, projectNumber } = projectInfo;

  logger.debug("Pruning secrets to find unused secret versions...");
  const unusedSecrets: Required<backend.SecretEnvVar>[] = await module.exports.pruneSecrets(
    { projectId, projectNumber },
    endpoints,
  );

  if (unusedSecrets.length === 0) {
    return { destroyed: [], erred: [] };
  }

  const destroyed: PruneResult["destroyed"] = [];
  const erred: PruneResult["erred"] = [];
  const msg = unusedSecrets.map((s) => `${s.secret}@${s.version}`);
  logger.debug(`Found unused secret versions: ${msg}. Destroying them...`);
  const destroyResults = await utils.allSettled<backend.SecretEnvVar>(
    unusedSecrets.map(async (sev) => {
      await destroySecretVersion(sev.projectId, sev.secret, sev.version);
      return sev;
    }),
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
 * Updates given endpoint to use the given secret version.
 */
export async function updateEndpointSecret(
  projectInfo: ProjectInfo,
  secretVersion: SecretVersion,
  endpoint: backend.Endpoint,
): Promise<backend.Endpoint> {
  const { projectId, projectNumber } = projectInfo;

  if (!inUse(projectInfo, secretVersion.secret, endpoint)) {
    return endpoint;
  }

  const updatedSevs: Required<backend.SecretEnvVar>[] = [];
  for (const sev of of([endpoint])) {
    const updatedSev = { ...sev } as Required<backend.SecretEnvVar>;
    if (
      (updatedSev.projectId === projectId || updatedSev.projectId === projectNumber) &&
      updatedSev.secret === secretVersion.secret.name
    ) {
      updatedSev.version = secretVersion.versionId;
    }
    updatedSevs.push(updatedSev);
  }

  if (endpoint.platform === "gcfv1") {
    const fn = gcfV1.functionFromEndpoint(endpoint, "");
    const op = await gcfV1.updateFunction({
      name: fn.name,
      runtime: fn.runtime,
      entryPoint: fn.entryPoint,
      secretEnvironmentVariables: updatedSevs,
    });
    const cfn = await poller.pollOperation<gcfV1.CloudFunction>({
      ...gcfV1PollerOptions,
      operationResourceName: op.name,
    });
    return gcfV1.endpointFromFunction(cfn);
  } else if (endpoint.platform === "gcfv2") {
    const fn = gcfV2.functionFromEndpoint(endpoint);
    const op = await gcfV2.updateFunction({
      ...fn,
      serviceConfig: {
        ...fn.serviceConfig,
        secretEnvironmentVariables: updatedSevs,
      },
    });
    const cfn = await poller.pollOperation<gcfV2.OutputCloudFunction>({
      ...gcfV2PollerOptions,
      operationResourceName: op.name,
    });
    return gcfV2.endpointFromFunction(cfn);
  } else {
    assertExhaustive(endpoint.platform);
  }
}
