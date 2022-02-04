import * as backend from "../deploy/functions/backend";
import {
  createSecret,
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

const FIREBASE_MANGED = "firebase-managed";

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
  projectInfo: { projectNumber: string; projectId: string },
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
  for (const sev of of(endpoints)) {
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

    prunedSecrets.delete(pruneKey(name, version!));
  }

  return Array.from(prunedSecrets)
    .map((key) => key.split("@"))
    .map(([secret, version]) => ({ projectId, version, secret, key: secret }));
}
