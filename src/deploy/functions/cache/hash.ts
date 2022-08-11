import * as fs from "fs";
import * as crypto from "crypto";
import * as args from "../args";
import * as secrets from "../../../functions/secrets";
import { Backend, Endpoint, EnvironmentVariables } from "../backend";

export async function getBackendHash(backend: Backend, source?: args.Source) {
  const hash = crypto.createHash("sha256");

  // If present, hash the contents of the source file
  if (source) {
    const sourceFile = source?.functionsSourceV2 || source?.functionsSourceV1;
    if (sourceFile) {
      const readStream = fs.createReadStream(sourceFile);
      readStream.pipe(hash);
      await new Promise((resolve, reject) => {
        hash.on("end", () => resolve(hash.read()));
        readStream.on("error", reject);
      });
    }
  }

  // Hash the contents of the dotenv variables
  if (hasEnvironmentVariables(backend.environmentVariables)) {
    hash.push(JSON.stringify(backend.environmentVariables));
  }

  // Hash the secret versions.
  const secretVersions = getSecretVersions(backend);
  if (hasSecretVersions(secretVersions)) {
    hash.push(JSON.stringify(secretVersions));
  }

  return hash.read().toString("hex");
}

function hasEnvironmentVariables(environmentVariables: EnvironmentVariables) {
  return Object.keys(environmentVariables).length;
}

function hasSecretVersions(secretVersions: Record<string, string>) {
  return Object.keys(secretVersions).length;
}

// Hash the secret versions.
function getSecretVersions(backend: Backend): Record<string, string> {
  const endpointsById = Object.values(backend?.endpoints || {});
  const endpointsList: Endpoint[] = endpointsById
    .map((endpoints) => Object.values(endpoints))
    .reduce((memo, endpoints) => [...memo, ...endpoints], []);
  return secrets.of(endpointsList).reduce((memo, { secret, version }) => {
    if (version) memo[secret] = version;
    return memo;
  }, {} as Record<string, string>);
}
