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

export const command = new Command("apphosting:secrets:grantaccess <secretNames>")
  .description(
    "Grant access to one or more App Hosting secrets (comma-separated). " +
      "Specify exactly one of --backend (grants the backend's service accounts access) " +
      "or --emails (grants the listed users or groups access); the two flags cannot be combined",
  )
  .option(
    "-l, --location <location>",
    'location of the --backend; "-" searches all locations. ' +
      "Required with --non-interactive if the backend ID exists in multiple locations",
    "-",
  )
  .option(
    "-b, --backend <backend>",
    "ID of the backend whose service accounts should be granted access (cannot be used with --emails)",
  )
  .option(
    "-e, --emails <emails>",
    "comma-separated list of user or group emails to grant access (cannot be used with --backend)",
  )
  .before(requireAuth)
  .before(secretManager.ensureApi)
  .before(apphosting.ensureApiEnabled)
  .before(requirePermissions, [
    "secretmanager.secrets.create",
    "secretmanager.secrets.get",
    "secretmanager.secrets.update",
    "secretmanager.versions.add",
    "secretmanager.secrets.getIamPolicy",
    "secretmanager.secrets.setIamPolicy",
  ])
  .action(async (secretNames: string, options: Options) => {
    if (!options.backend && !options.emails) {
      throw new FirebaseError(
        "Missing required flag: specify exactly one of --backend <backendId> or --emails <emails>. " +
          "See firebase apphosting:secrets:grantaccess --help for more info",
      );
    }
    if (options.backend && options.emails) {
      throw new FirebaseError(
        "Cannot specify both --backend and --emails. Run the command once with --backend " +
          "and once with --emails to grant access to both. " +
          "See firebase apphosting:secrets:grantaccess --help for more info",
      );
    }

    const projectId = needProjectId(options);
    const projectNumber = await needProjectNumber(options);

    const secretList = secretNames.split(",");
    for (const secretName of secretList) {
      const exists = await secretManager.secretExists(projectId, secretName);
      if (!exists) {
        throw new FirebaseError(`Cannot find secret ${secretName}`);
      }
    }

    if (options.emails) {
      return await secrets.grantEmailsSecretAccess(
        projectId,
        secretList,
        String(options.emails).split(","),
      );
    }

    const backendId = options.backend as string;
    const location = options.location as string;
    let backend: apphosting.Backend;
    if (location === "" || location === "-") {
      backend = await getBackendForAmbiguousLocation(
        projectId,
        backendId,
        "Please select the location of your backend:",
        /* force= */ !!options.nonInteractive,
      );
    } else {
      backend = await apphosting.getBackend(projectId, location, backendId);
    }

    const accounts = secrets.toMulti(
      await secrets.serviceAccountsForBackend(projectNumber, backend),
    );

    await Promise.allSettled(
      secretList.map((secretName) =>
        secrets.grantSecretAccess(projectId, projectNumber, secretName, accounts),
      ),
    );
  });
