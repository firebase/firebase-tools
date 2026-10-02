import { Command } from "../command";
import { Options } from "../options";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { FirebaseError } from "../error";
import { requireAuth } from "../requireAuth";
import * as secretManager from "../gcp/secretManager";
import { requirePermissions } from "../requirePermissions";
import * as apphosting from "../gcp/apphosting";
import * as secrets from "../apphosting/secrets";
import { getBackendForAmbiguousLocation } from "../apphosting/backend";

export const command = new Command("apphosting:secrets:revokeaccess <secretNames>")
  .description(
    "Revoke service accounts, users, or groups permissions from the provided secret(s). Can pass one or more secrets, separated by a comma",
  )
  .option(
    "-l, --location <location>",
    "the location of the backend to revoke secret access from. Cannot be combined with --emails",
    "-",
  )
  .option(
    "-b, --backend <backend>",
    "the name of the backend to revoke secret access from. Cannot be combined with --emails",
  )
  .option(
    "-e, --emails <emails>",
    "comma delimited list of user or group emails to revoke secret access from. Cannot be combined with --backend",
  )
  .before(requireAuth)
  .before(secretManager.ensureApi)
  .before(apphosting.ensureApiEnabled)
  .before(requirePermissions, [
    "secretmanager.secrets.get",
    "secretmanager.secrets.getIamPolicy",
    "secretmanager.secrets.setIamPolicy",
  ])
  .action(async (secretNames: string, options: Options) => {
    const projectId = needProjectId(options);

    if (!options.backend && !options.emails) {
      throw new FirebaseError(
        "Missing required flag --backend or --emails. See firebase apphosting:secrets:revokeaccess --help for more info",
      );
    }
    if (options.backend && options.emails) {
      throw new FirebaseError(
        "Cannot specify both --backend and --emails. See firebase apphosting:secrets:revokeaccess --help for more info",
      );
    }

    const secretList = secretNames.split(",");
    for (const secretName of secretList) {
      const exists = await secretManager.secretExists(projectId, secretName);
      if (!exists) {
        throw new FirebaseError(`Cannot find secret ${secretName}`);
      }
    }

    if (options.emails) {
      return await secrets.revokeEmailsSecretAccess(
        projectId,
        secretList,
        String(options.emails).split(","),
      );
    }

    const projectNumber = await needProjectNumber(options);
    const backendId = options.backend as string;
    const location = options.location as string;
    let backend: apphosting.Backend;
    if (location === "" || location === "-") {
      backend = await getBackendForAmbiguousLocation(
        projectId,
        backendId,
        "Please select the location of your backend:",
      );
    } else {
      backend = await apphosting.getBackend(projectId, location, backendId);
    }

    const accounts = secrets.toMulti(
      await secrets.serviceAccountsForBackend(projectNumber, backend),
    );

    await Promise.all(
      secretList.map((secretName) => secrets.revokeSecretAccess(projectId, secretName, accounts)),
    );
  });
