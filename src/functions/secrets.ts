import {
  createSecret,
  getSecret,
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
import { Endpoint } from "../deploy/functions/backend";

const FIREBASE_MANGED = "firebase-managed";

/**
 * Returns true if secret is managed by Firebase.
 */
function isFirebaseManaged(secret: Secret): boolean {
  return Object.keys(secret.labels || []).includes(FIREBASE_MANGED);
}

/**
 * Return labels to mark secret as managed by Firebase.
 * @internal
 */
export function labels(): Record<string, string> {
  return { [FIREBASE_MANGED]: "true" };
}

function transformKey(key: string): string {
  return key
    .replace("-", "_")
    .replace(".", "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toUpperCase();
}

/**
 * Validate and transform keys to match the convention recommended by Firebase.
 */
export function ensureValidKey(key: string, options: Options): string {
  const transformedKey = transformKey(key);
  if (transformedKey !== key) {
    if (options.force) {
      throw new FirebaseError("Secret key must be in UPPER_SNAKE_CASE.");
    }
    logWarning(
      `By convention, secret key must be in UPPER_SNAKE_CASE. Using ${transformedKey} as key instead.`
    );
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

async function listFirebaseSecrets(options: Options): Promise<SecretVersion[]> {
  const secrets = await listSecrets(options.projectId!, "labels.firebase-managed=true");
  const secretVersions: SecretVersion[] = [];

  const listVersions = secrets.map(async (secret) => {
    const versions = await listSecretVersions(options.projectId!, secret.name, "state:ENABLED");
    secretVersions.push(...versions);
  });

  await Promise.all(listVersions);
  return secretVersions;
}

function secretVersionsFromEndpoint(options: Options, endpoints: Endpoint[]): SecretVersion[] {
  const versions: SecretVersion[] = [];
  for (const endpoint of endpoints) {
    for (const sev of endpoint.secretEnvironmentVariables ?? []) {
      if (sev.projectId === options.projectId || sev.projectId === options.projectNumber) {
        let name = sev.secret;
        if (name.includes("/")) {
          const secret = parseSecretResourceName(name);
          name = secret.name;
        }
        versions.push({
          secret: { name, projectId: options.projectId! },
          version: sev.version!,
        });
      }
    }
  }
  return versions;
}

export async function pruneSecrets(options: Options, endpoints: Endpoint[]) {
  const haveVersions = await listFirebaseSecrets(options);
  const needVersions = secretVersionsFromEndpoint(options, endpoints);

  console.log(JSON.stringify(haveVersions));
  console.log("===========");
  console.log(JSON.stringify(needVersions));
  console.log("===========");
  const haveSet = new Set(haveVersions.map((sv) => `${sv.secret.name}@${sv.version}`));
  const needSet = new Set(needVersions.map((sv) => `${sv.secret.name}@${sv.version}`));
  console.log(haveSet);
  console.log(needSet);
  const pruneSet = new Set([...haveSet].filter((x) => !new Set(needSet).has(x)));
  console.log("===========");
  console.log("===========");
  console.log(pruneSet);
}
