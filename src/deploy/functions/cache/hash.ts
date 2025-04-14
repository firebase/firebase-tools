import { readFile } from "node:fs/promises";
import * as crypto from "crypto";
import { BinaryLike } from "crypto";
import { Backend, Endpoint } from "../backend";
import { getSecretVersions } from "../../../functions/secrets";

/**
 * Generates a hash from the environment variables of a {@link Backend}.
 * @param backend Backend of a set of functions
 */
export function getEnvironmentVariablesHash(backend: Backend): string {
  // Hash the contents of the dotenv variables
  return createHash(JSON.stringify(backend.environmentVariables || {}));
}

/**
 * Retrieves the unique hash given a pathToFile.
 * @param pathToFile Packaged file contents of functions
 */
export async function getSourceHash(pathToFile: string): Promise<string> {
  // Hash the contents of a file, ignoring metadata.
  // Excluding metadata in the hash is important because some
  // files are dynamically generated on deploy.
  const data = await readFile(pathToFile);
  return createHash(data);
}

/**
 * Retrieves a hash generated from the secrets of an {@link Endpoint}.
 * @param endpoint Endpoint
 */
export function getSecretsHash(endpoint: Endpoint): string {
  // Hash the secret versions.
  const secretVersions = getSecretVersions(endpoint);
  return createHash(JSON.stringify(secretVersions || {}));
}

/**
 * Generates a unique hash derived from the hashes generated from the
 * package source, environment variables, and endpoint secrets.
 * @param sourceHash
 * @param envHash
 * @param secretsHash
 */
export function getEndpointHash(
  sourceHash?: string,
  envHash?: string,
  secretsHash?: string,
): string {
  const combined = [sourceHash, envHash, secretsHash].filter((hash) => !!hash).join("");
  return createHash(combined);
}

// Helper method to create hashes consistently
function createHash(data: BinaryLike, algorithm = "sha1") {
  const hash = crypto.createHash(algorithm);
  hash.update(data);
  return hash.digest("hex");
}
