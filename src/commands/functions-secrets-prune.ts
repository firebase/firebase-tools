import * as args from "../deploy/functions/args";
import * as backend from "../deploy/functions/backend";
import * as secrets from "../functions/secrets";

import { Command } from "../command";
import { Options } from "../options";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";
import { isFirebaseManaged } from "../deploymentTool";
import { logBullet, logSuccess } from "../utils";
import { promptOnce } from "../prompt";
import { destroySecretVersion } from "../gcp/secretManager";
import { requireAuth } from "../requireAuth";

export const command = new Command("functions:secrets:prune")
  .withForce("Destroys unused secrets without prompt")
  .description("Destroys unused secrets")
  .before(requireAuth)
  .before(secrets.ensureApi)
  .before(requirePermissions, [
    "cloudfunctions.functions.list",
    "secretmanager.secrets.list",
    "secretmanager.versions.list",
    "secretmanager.versions.destroy",
  ])
  .action(async (options: Options) => {
    const projectNumber = await needProjectNumber(options);
    const projectId = needProjectId(options);

    logBullet("Loading secrets...");

    const haveBackend = await backend.existingBackend({ projectId } as args.Context);
    const haveEndpoints = backend
      .allEndpoints(haveBackend)
      .filter((e) => isFirebaseManaged(e.labels || []));

    const pruned = await secrets.pruneSecrets({ projectNumber, projectId }, haveEndpoints);

    if (pruned.length === 0) {
      logBullet("All secrets are in use. Nothing to prune today.");
      return;
    }

    // prompt to get them all deleted
    logBullet(
      `Found ${pruned.length} unused active secret versions:\n\t` +
        pruned.map((sv) => `${sv.secret}@${sv.version}`).join("\n\t"),
    );

    if (!options.force) {
      const confirm = await promptOnce(
        {
          name: "destroy",
          type: "confirm",
          default: true,
          message: `Do you want to destroy unused secret versions?`,
        },
        options,
      );
      if (!confirm) {
        logBullet(
          "Run the following commands to destroy each unused secret version:\n\t" +
            pruned
              .map((sv) => `firebase functions:secrets:destroy ${sv.secret}@${sv.version}`)
              .join("\n\t"),
        );
        return;
      }
    }
    await Promise.all(pruned.map((sv) => destroySecretVersion(projectId, sv.secret, sv.version)));
    logSuccess("Destroyed all unused secrets!");
  });
