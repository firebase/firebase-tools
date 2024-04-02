import { Command } from "../command";
import { Options } from "../options";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { FirebaseError } from "../error";
import { requireAuth } from "../requireAuth";
import * as secretManager from "../gcp/secretManager";
import { requirePermissions } from "../requirePermissions";
import * as apphosting from "../gcp/apphosting";
import * as secrets from "../apphosting/secrets";

export const command = new Command("apphosting:secrets:grantaccess <secretName>")
  .description("grant service accounts permissions to the provided secret")
  .option("-l, --location <location>", "app backend location")
  .option("-b, --backend <backend>", "app backend name")
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

    // TODO: Consider reusing dialog in apphosting/secrets/dialogs.ts if backend (and location) is not set.
    if (!options.location) {
      throw new FirebaseError(
        "Missing required flag --location. See firebase apphosting:secrets:grantaccess --help for more info",
      );
    }
    const location = options.location as string;

    if (!options.backend) {
      throw new FirebaseError(
        "Missing required flag --backend. See firebase apphosting:secrets:grantaccess --help for more info",
      );
    }

    // TODO: consider showing dialog if both --location and --backend are missing

    let secret: secretManager.Secret;
    try {
      secret = await secretManager.getSecret(projectId, secretName);
    } catch (err: any) {
      if (err.status === 404) {
        throw new FirebaseError(`Cannot find secret ${secretName}`);
      }
      throw new FirebaseError(`Unexpected error loading secret ${secretName}`, {
        original: err as Error,
      });
    }

    const backendId = options.backend as string;
    const backend = await apphosting.getBackend(projectId, location, backendId);
    const accounts = secrets.toMulti(secrets.serviceAccountsForBackend(projectNumber, backend));

    await secrets.grantSecretAccess(secret, accounts);
  });
