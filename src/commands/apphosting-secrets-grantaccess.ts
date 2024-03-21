import { Command } from "../command";
import { Options } from "../options";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { FirebaseError } from "../error";
import { requireAuth } from "../requireAuth";
import * as secrets from "../functions/secrets";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import * as apphosting from "../gcp/apphosting";
import * as secretManager from "../gcp/secretManager";
import { setIamPolicy } from "../gcp/secretManager";
import * as iam from "../gcp/iam";

export const command = new Command("apphosting:secrets:grantaccess <secretName>")
  .description("grant service accounts permissions to the provided secret")
  .option("-l, --location <location>", "app backend location")
  .option("-b, --backend <backend>", "app backend name")
  .before(requireAuth)
  .before(secrets.ensureApi)
  .before(apphosting.ensureApiEnabled)
  .before(requirePermissions, [
    "secretmanager.secrets.create",
    "secretmanager.secrets.get",
    "secretmanager.secrets.update",
    "secretmanager.versions.add",
    "secretmanager.secrets.setIamPolicy",
  ])
  .action(async (secretName: string, options: Options) => {
    const projectId = needProjectId(options);
    const projectNumber = await needProjectNumber(options);

    if (!options.location) {
      logger.error(
        "Missing required flag --location. See firebase apphosting:secrets:grantaccess --help for more info",
      );
      return;
    }
    const location = options.location as string;

    if (!options.backend) {
      logger.error(
        "Missing required flag --backend. See firebase apphosting:secrets:grantaccess --help for more info",
      );
      return;
    }
    const backend = options.backend as string;

    const isExist = await secretManager.secretExists(projectId, secretName);
    if (!isExist) {
      throw new FirebaseError(`Secret ${secretName} does not exist in project ${projectId}`);
    }

    let serviceAccounts = { buildServiceAccount: "", runServiceAccount: "" };
    try {
      serviceAccounts = fetchServiceAccounts(projectNumber);
    } catch (err: any) {
      throw new FirebaseError(
        `Failed to get backend ${backend} at location ${location}. Please check the parameters you have provided.`,
        { original: err },
      );
    }

    const secret: secretManager.Secret = {
      projectId: projectId,
      name: secretName,
    };

    const bindings: iam.Binding[] = [
      {
        role: "roles/secretmanager.secretAccessor",
        members: [
          `serviceAccount:${serviceAccounts.buildServiceAccount}`,
          `serviceAccount:${serviceAccounts.runServiceAccount}`,
        ],
      },
      {
        role: "roles/secretmanager.viewer",
        members: [`serviceAccount:${serviceAccounts.buildServiceAccount}`],
      },
    ];

    try {
      await setIamPolicy(secret, bindings);
    } catch (err: any) {
      throw new FirebaseError(
        `Failed to set IAM bindings ${bindings.toString()} on secret: ${secret.name}. Ensure you have the permissions to do so and try again.`,
        { original: err },
      );
    }

    logger.info(`Successfully set IAM bindings ${bindings.toString()} on secret: ${secret.name}.`);
  });

function defaultCloudBuildServiceAccount(projectNumber: string): string {
  return `${projectNumber}@cloudbuild.gserviceaccount.com`;
}

function defaultComputeEngineServiceAccount(projectNumber: string): string {
  return `${projectNumber}-compute@developer.gserviceaccount.com`;
}

function fetchServiceAccounts(projectNumber: string): {
  buildServiceAccount: string;
  runServiceAccount: string;
} {
  // TODO: For now we will always return the default CBSA and CESA. When the getBackend call supports returning
  // the attached service account in a given backend/location then return that value instead.
  // Sample Call: await apphosting.getBackend(projectId, location, backendId); & make this function async
  return {
    buildServiceAccount: defaultCloudBuildServiceAccount(projectNumber),
    runServiceAccount: defaultComputeEngineServiceAccount(projectNumber),
  };
}
