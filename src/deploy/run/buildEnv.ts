import { FirebaseError } from "../../error";
import * as runv2 from "../../gcp/runv2";
import { EnvMap } from "../../apphosting/yaml";

/**
 * Prototype: build-time environment variables and secret references, stored on the Cloud Run
 * service. It extends Cloud Run's own buildConfig.environmentVariables (a map of plain strings):
 * the same map parses unchanged, and a value can also be a secret reference in the shape of
 * Cloud Run's runtime secretKeyRef. It holds references only, never secret values.
 * Example: {"API_URL": "https://example.com", "NPM_TOKEN": {"secret": "npm-token", "version": "3"}}
 */
export const BUILD_ENV_ANNOTATION =
  "firebase.google.com/buildConfig.environmentVariablesAndSecrets";

/** A Secret Manager secret, as a name in the service's project or a full resource name. */
export interface SecretRef {
  secret: string;
  /** A version number or "latest". Defaults to "latest". */
  version?: string;
}

export type BuildEnv = Record<string, string | SecretRef>;

const SECRET_NAME = /^(?:projects\/[^/]+\/secrets\/)?[^/@]+$/;
const SECRET_VERSION = /^(?:latest|\d+)$/;

/** Reads and validates the service's build environment. Returns {} if it has none. */
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
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value === "string") {
      continue;
    }
    const ref = value as Partial<SecretRef> | null;
    const valid =
      typeof ref === "object" &&
      ref !== null &&
      !Array.isArray(ref) &&
      Object.keys(ref).every((k) => k === "secret" || k === "version") &&
      typeof ref.secret === "string" &&
      SECRET_NAME.test(ref.secret) &&
      (ref.version === undefined ||
        (typeof ref.version === "string" && SECRET_VERSION.test(ref.version)));
    if (!valid) {
      throw invalid(
        `${name} must be a string or {"secret": "<name>", "version": "<number or latest>"}.`,
      );
    }
  }
  return parsed as BuildEnv;
}

/** Names of the variables that are secret references. */
export function secretNames(env: BuildEnv): string[] {
  return Object.entries(env)
    .filter(([, value]) => typeof value !== "string")
    .map(([name]) => name);
}

/** Converts the build environment to the form local builds take; they resolve the secrets. */
export function toLocalBuildEnv(env: BuildEnv): EnvMap {
  const result: EnvMap = {};
  for (const [name, value] of Object.entries(env)) {
    if (typeof value === "string") {
      result[name] = { value, availability: ["BUILD"] };
    } else {
      const version = value.version || "latest";
      const secret = value.secret.startsWith("projects/")
        ? `${value.secret}/versions/${version}`
        : `${value.secret}@${version}`;
      result[name] = { secret, availability: ["BUILD"] };
    }
  }
  return result;
}
