import { FirebaseError } from "../../error";
import * as runv2 from "../../gcp/runv2";
import { EnvMap } from "../../apphosting/yaml";

/**
 * Prototype: build-time env vars and secrets, stored on the Cloud Run service as a JSON object.
 * Each value is a string, a number or boolean (which becomes a string, as in apphosting.yaml), or a
 * Secret Manager secret written the way apphosting.yaml writes one: {"secret": "<name>"},
 * {"secret": "<name>@<version>"}, or {"secret": "<full resource name>"}.
 * For example:
 *   {
 *     "API_URL": "https://api.example.com",
 *     "NEXT_TELEMETRY_DISABLED": 1,
 *     "NPM_TOKEN": {"secret": "npm-token"},
 *     "SENTRY_AUTH_TOKEN": {"secret": "sentry-auth-token@2"},
 *     "GITHUB_TOKEN": {"secret": "projects/shared-secrets/secrets/github-token/versions/3"}
 *   }
 * The annotation only names secrets. Their values stay in Secret Manager.
 */
export const BUILD_ENV_ANNOTATION =
  "firebase.google.com/buildConfig.environmentVariablesAndSecrets";

/**
 * A Secret Manager secret, in App Hosting's format. A version is optional and defaults to the
 * latest. Local builds read the secret with App Hosting's loadSecret, which checks the format.
 */
export interface SecretRef {
  secret: string;
}

export type BuildEnv = Record<string, string | SecretRef>;

/**
 * Reads and validates the service's build environment. Returns {} if it has none. Numbers and
 * booleans come back as strings, since env vars are strings.
 */
export function getBuildEnv(service: runv2.Service | undefined): BuildEnv {
  const raw = service?.annotations?.[BUILD_ENV_ANNOTATION];
  if (!service || !raw) {
    return {};
  }
  const invalid = (reason: string): FirebaseError =>
    new FirebaseError(`Invalid ${BUILD_ENV_ANNOTATION} annotation on ${service.name}: ${reason}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid("it isn't valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw invalid("it must be a JSON object.");
  }
  const env: BuildEnv = {};
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value === "string" || isSecretRef(value)) {
      env[name] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      // apphosting.yaml takes unquoted numbers and booleans too. JSON doesn't keep how a number was
      // written, so 1.50 becomes "1.5". Quote a value to keep it exactly as written.
      env[name] = String(value);
    } else {
      throw invalid(`${name} must be a string, number, boolean, or {"secret": "<secret name>"}.`);
    }
  }
  return env;
}

/** Whether a value is {"secret": "<secret name>"}, with no other fields. */
function isSecretRef(value: unknown): value is SecretRef {
  const ref = value as Partial<SecretRef> | null;
  return (
    typeof ref === "object" &&
    ref !== null &&
    Object.keys(ref).length === 1 &&
    typeof ref.secret === "string"
  );
}

/** Names of the variables that are secrets. */
export function secretNames(env: BuildEnv): string[] {
  return Object.entries(env)
    .filter(([, value]) => isSecretRef(value))
    .map(([name]) => name);
}

/**
 * The env vars that aren't secrets, with their values. Secrets are left out entirely, so the result
 * never names a secret or holds a secret's value.
 */
export function nonSecretValues(env: BuildEnv): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (!isSecretRef(value)) {
      values[name] = value;
    }
  }
  return values;
}

/**
 * Converts the build environment to the form local builds take. Secrets pass through unchanged:
 * the local build reads them with your credentials.
 */
export function toLocalBuildEnv(env: BuildEnv): EnvMap {
  const result: EnvMap = {};
  for (const [name, value] of Object.entries(env)) {
    if (isSecretRef(value)) {
      result[name] = { secret: value.secret, availability: ["BUILD"] };
    } else {
      result[name] = { value, availability: ["BUILD"] };
    }
  }
  return result;
}
