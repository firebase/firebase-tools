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

export const command = new Command("apphosting:secrets:grantaccess <secretName>")
  .description("grant service accounts permissions to the provided secret")
  .option("-l, --location <location>", "backend location", "-")
  .option("-b, --backend <backend>", "backend name")
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
  .action(async (secretName: string, options: Options) => {
    const projectId = needProjectId(options);
    const projectNumber = await needProjectNumber(options);

    if (!options.backend) {
      throw new FirebaseError(
        "Missing required flag --backend. See firebase apphosting:secrets:grantaccess --help for more info",
      );
    }

    const exists = await secretManager.secretExists(projectId, secretName);
    if (!exists) {
      throw new FirebaseError(`Cannot find secret ${secretName}`);
    }

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

    const accounts = secrets.toMulti(secrets.serviceAccountsForBackend(projectNumber, backend));

    await secrets.grantSecretAccess(projectId, projectNumber, secretName, accounts);
  });
