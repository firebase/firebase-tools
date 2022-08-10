import * as fs from "fs";
import * as crypto from "crypto";
import * as args from "../args";
import * as secrets from "../../../functions/secrets";
import * as backend from "../backend";

export async function getLocalHash(source: args.Source, wantBackend: backend.Backend) {
  const hash = crypto.createHash("sha256");
  const sourceFile = source.functionsSourceV2 || source.functionsSourceV1;
  // Hash the contents of the source file
  if (sourceFile) {
    const readStream = fs.createReadStream(sourceFile);
    readStream.pipe(hash);
    await new Promise((resolve, reject) => {
      hash.on("end", () => resolve(hash.read()));
      readStream.on("error", reject);
    });
  }

  // Hash the contents of the dotenv variables
  hash.push(wantBackend?.environmentVariables);

  // Hash the secret versions.
  hash.push(getSecretVersions(wantBackend));

  return hash.read().toString("hex");
}

// Hash the secret versions.
function getSecretVersions(wantBackend: backend.Backend): Record<string, string> {
  const endpointsById = Object.values(wantBackend?.endpoints || {});
  const endpointsList: backend.Endpoint[] = endpointsById
    .map((endpoints) => Object.values(endpoints))
    .reduce((memo, endpoints) => [...memo, ...endpoints], []);
  return secrets.of(endpointsList).reduce((memo, { secret, version }) => {
    if (version) memo[secret] = version;
    return memo;
  }, {} as Record<string, string>);
}
