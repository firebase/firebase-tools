import { Command } from "../command";
import { Options } from "../options";
import { needProjectId, needProjectNumber } from "../projectUtils";
import {
  deleteSecret,
  destroySecretVersion,
  getSecret,
  getSecretVersion,
  listSecretVersions,
} from "../gcp/secretManager";
import { promptOnce } from "../prompt";
import { logBullet, logWarning } from "../utils";
import { requireAuth } from "../requireAuth";
import * as secrets from "../functions/secrets";
import * as backend from "../deploy/functions/backend";
import * as args from "../deploy/functions/args";

export const command = new Command("functions:secrets:destroy <KEY>[@version]")
  .description("Destroy a secret. Defaults to destroying the latest version.")
  .withForce("Destroys a secret without confirmation.")
  .before(requireAuth)
  .before(secrets.ensureApi)
  .action(async (key: string, options: Options) => {
    const projectId = needProjectId(options);
    const projectNumber = await needProjectNumber(options);
    const haveBackend = await backend.existingBackend({ projectId } as args.Context);

    let [name, version] = key.split("@");
    if (!version) {
      version = "latest";
    }
    const sv = await getSecretVersion(projectId, name, version);

    if (sv.state === "DESTROYED") {
      logBullet(`Secret ${sv.secret.name}@${version} is already destroyed. Nothing to do.`);
      return;
    }

    const boundEndpoints = backend
      .allEndpoints(haveBackend)
      .filter((e) => secrets.inUse({ projectId, projectNumber }, sv.secret, e));
    if (boundEndpoints.length > 0) {
      const endpointsMsg = boundEndpoints
        .map((e) => `${e.id}[${e.platform}](${e.region})`)
        .join("\t\n");
      logWarning(
        `Secret ${name}@${version} is currently in use by following functions:\n\t${endpointsMsg}`,
      );
      if (!options.force) {
        logWarning("Refusing to destroy secret in use. Use -f to destroy the secret anyway.");
        return;
      }
    }

    if (!options.force) {
      const confirm = await promptOnce(
        {
          name: "destroy",
          type: "confirm",
          default: true,
          message: `Are you sure you want to destroy ${sv.secret.name}@${sv.versionId}`,
        },
        options,
      );
      if (!confirm) {
        return;
      }
    }
    await destroySecretVersion(projectId, name, version);
    logBullet(`Destroyed secret version ${name}@${sv.versionId}`);

    const secret = await getSecret(projectId, name);
    if (secrets.isFirebaseManaged(secret)) {
      const versions = await listSecretVersions(projectId, name);
      if (versions.filter((v) => v.state === "ENABLED").length === 0) {
        logBullet(`No active secret versions left. Destroying secret ${name}`);
        // No active secret version. Remove secret resource.
        await deleteSecret(projectId, name);
      }
    }
  });
