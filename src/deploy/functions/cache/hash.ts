import * as crypto from "crypto";
import { Backend, Endpoint } from "../backend";
import { getSecretVersions } from "../../../functions/secrets";
import * as unzipper from "unzipper";
import * as fs from "fs";
import * as stream from "stream";

/**
 * Generates a hash from the environment variables of a {@link Backend}.
 * @param backend Backend of a set of functions
 */
export function getEnvironmentVariablesHash(backend: Backend): string {
  const hash = crypto.createHash("sha1");

  // Hash the contents of the dotenv variables
  const hasEnvironmentVariables = !!Object.keys(backend.environmentVariables).length;
  if (hasEnvironmentVariables) {
    hash.update(JSON.stringify(backend.environmentVariables));
  }

  return hash.digest("hex");
}

interface PathHash {
  path: string;
  hash: number;
}

/**
 * Retrieves the unique hash given a pathToGeneratedPackageFile.
 * @param pathToGeneratedPackageFile Packaged file contents of functions
 */
export async function getSourceHash(pathToGeneratedPackageFile: string): Promise<string> {
  const hash = crypto.createHash("sha1");

  const pathHashes: PathHash[] = [];

  const zip = fs
    .createReadStream(pathToGeneratedPackageFile)
    // eslint-disable-next-line new-cap
    .pipe(unzipper.Parse({ forceStream: true }))
    .pipe(
      new stream.Transform({
        objectMode: true,
        transform: async (entry) => {
          console.log(entry, entry.path, entry.vars);
          if (entry?.path && entry?.vars?.crc32) {
            pathHashes.push({
              path: entry.path,
              hash: entry.vars.crc32,
            });
          }
          await entry.autodrain().promise();
        },
      })
    );

  for await (const entry of zip) {
    await entry.autodrain().promise();
    console.log(entry, entry.path, entry.vars);
    if (entry?.path && entry?.vars?.crc32) {
      pathHashes.push({
        path: entry.path,
        hash: entry.vars.crc32,
      });
    }
  }

  const pathHashString = pathHashes
    .sort((p1: PathHash, p2: PathHash) => {
      if (p1.path < p2.path) return -1;
      if (p1.path > p2.path) return 1;
      return 0;
    })
    .map((pathHash: PathHash) => pathHash.hash)
    .join(":");
  hash.update(pathHashString);

  return hash.digest("hex");
}

/**
 * Retrieves a hash generated from the secrets of an {@link Endpoint}.
 * @param endpoint Endpoint
 */
export function getSecretsHash(endpoint: Endpoint): string {
  const hash = crypto.createHash("sha1");

  // Hash the secret versions.
  const secretVersions = getSecretVersions(endpoint);
  const hasSecretVersions = !!Object.keys(secretVersions).length;
  if (hasSecretVersions) {
    hash.update(JSON.stringify(secretVersions));
  }

  return hash.digest("hex");
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
  secretsHash?: string
): string {
  const hash = crypto.createHash("sha1");

  const combined = [sourceHash, envHash, secretsHash].filter((hash) => !!hash).join("");
  hash.update(combined);

  return hash.digest("hex");
}
