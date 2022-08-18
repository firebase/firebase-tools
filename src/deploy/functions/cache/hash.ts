import { readFile } from "node:fs/promises";
import * as crypto from "crypto";
import { Backend, Endpoint, EnvironmentVariables } from "../backend";

/**
 * Generates a hash from the environment variables of a {@link Backend}.
 * @param backend Backend of a set of functions
 */
export function getEnvironmentVariablesHash(backend: Backend) {
  const hash = crypto.createHash("sha256");

  // Hash the contents of the dotenv variables
  if (hasEnvironmentVariables(backend.environmentVariables)) {
    hash.update(JSON.stringify(backend.environmentVariables));
  }

  return hash.digest("hex");
}

/**
 * Retrieves the unique hash given a pathToGeneratedPackageFile.
 * @param backend Backend of a set of functions
 * @param pathToGeneratedPackageFile Packaged file contents of functions
 */
export async function getSourceHash(pathToGeneratedPackageFile?: string) {
  const hash = crypto.createHash("sha256");

  // If present, hash the contents of the source file
  if (pathToGeneratedPackageFile) {
    const data = await readFile(pathToGeneratedPackageFile);
    hash.update(data);
  }

  return hash.digest("hex");
}

/**
 * Retrieves a hash generated from the secrest of {@link Endpoint}.
 * @param endpoint Endpoint
 */
export function getSecretsHash(endpoint: Endpoint) {
  const hash = crypto.createHash("sha256");

  // Hash the secret versions.
  const secretVersions = getSecretVersions(endpoint);
  if (hasSecretVersions(secretVersions)) {
    hash.update(JSON.stringify(secretVersions));
  }

  return hash.digest("hex");
}

/**
 * Generates a unique hash derived from the hashes generated from the package source, environment variables, and endpoint secrets.
 */
export function getEndpointHash(sourceHash: string, envHash: string, secretsHash: string) {
  const hash = crypto.createHash("sha256");

  const combined = [envHash, sourceHash, secretsHash].join("");
  hash.update(combined);

  return hash.digest("hex");
}

function hasEnvironmentVariables(environmentVariables: EnvironmentVariables): boolean {
  return !!Object.keys(environmentVariables).length;
}

function hasSecretVersions(secretVersions: Record<string, string>): boolean {
  return !!Object.keys(secretVersions).length;
}

// Hash the secret versions.
function getSecretVersions(endpoint: Endpoint): Record<string, string> {
  return (endpoint.secretEnvironmentVariables || []).reduce((memo, { secret, version }) => {
    if (version) {
      memo[secret] = version;
    }
    return memo;
  }, {} as Record<string, string>);
}
