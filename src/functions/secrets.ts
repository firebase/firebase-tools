import { createSecret, getSecret, patchSecret, Secret } from "../gcp/secretManager";
import { Options } from "../options";
import { FirebaseError } from "../error";
import { logWarning } from "../utils";
import { promptOnce } from "../prompt";

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
      throw new FirebaseError("Secret key must be in UPPERCASE.");
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
