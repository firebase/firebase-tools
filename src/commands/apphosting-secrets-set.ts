import { Command } from "../command";
import { Options } from "../options";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import * as gcsm from "../gcp/secretManager";
import * as apphosting from "../gcp/apphosting";
import { requirePermissions } from "../requirePermissions";
import { apphostingSecretsSetAction } from "../apphosting/secrets";

export const command = new Command("apphosting:secrets:set <secretName>")
  .description("create or update a secret for use in Firebase App Hosting")
  .option("-l, --location <location>", "optional location to retrict secret replication")
  // TODO: What is the right --force behavior for granting access? Seems correct to grant permissions
  // if there is only one set of accounts, but should maybe fail if there are more than one set of
  // accounts for different backends?
  .withForce("Automatically create a secret, grant permissions, and add to YAML.")
  .before(requireAuth)
  .before(gcsm.ensureApi)
  .before(apphosting.ensureApiEnabled)
  .before(requirePermissions, [
    "secretmanager.secrets.create",
    "secretmanager.secrets.get",
    "secretmanager.secrets.update",
    "secretmanager.versions.add",
    "secretmanager.secrets.getIamPolicy",
    "secretmanager.secrets.setIamPolicy",
  ])
  .option(
    "--data-file <dataFile>",
    'File path from which to read secret data. Set to "-" to read the secret data from stdin.',
  )
  .action(async (secretName: string, options: Options) => {
    const projectId = needProjectId(options);
    const projectNumber = await needProjectNumber(options);
    return apphostingSecretsSetAction(
      secretName,
      projectId,
      projectNumber,
      options.location as string | undefined,
      options.dataFile as string | undefined,
      options.nonInteractive,
    );
  });
