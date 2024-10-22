import { FirebaseError } from "../../error";
import * as iam from "../../gcp/iam";
import * as gcsm from "../../gcp/secretManager";
import * as gcb from "../../gcp/cloudbuild";
import * as gce from "../../gcp/computeEngine";
import * as apphosting from "../../gcp/apphosting";
import { FIREBASE_MANAGED } from "../../gcp/secretManager";
import { isFunctionsManaged } from "../../gcp/secretManager";
import * as utils from "../../utils";
import * as prompt from "../../prompt";
import { basename, dirname } from "path";
import { APPHOSTING_BASE_YAML_FILE, AppHostingReadableConfiguration } from "../config";
import { loadAppHostingYaml } from "../utils";

/** Interface for holding the service account pair for a given Backend. */
export interface ServiceAccounts {
  buildServiceAccount: string;
  runServiceAccount: string;
}

/**
 * Interface for holding a collection of service accounts we need to grant access to.
 * Build accounts are special because they also need secret viewer permissions to view versions
 * and pin to the latest. Run accounts only need version accessor.
 */
export interface MultiServiceAccounts {
  buildServiceAccounts: string[];
  runServiceAccounts: string[];
}

/** Utility function to turn a single ServiceAccounts into a MultiServiceAccounts.  */
export function toMulti(accounts: ServiceAccounts): MultiServiceAccounts {
  const m: MultiServiceAccounts = {
    buildServiceAccounts: [accounts.buildServiceAccount],
    runServiceAccounts: [],
  };
  if (accounts.buildServiceAccount !== accounts.runServiceAccount) {
    m.runServiceAccounts.push(accounts.runServiceAccount);
  }
  return m;
}

/**
 * Finds the explicit service account used for a backend or, for legacy cases,
 * the defaults for GCB and compute.
 */
export function serviceAccountsForBackend(
  projectNumber: string,
  backend: apphosting.Backend,
): ServiceAccounts {
  if (backend.serviceAccount) {
    return {
      buildServiceAccount: backend.serviceAccount,
      runServiceAccount: backend.serviceAccount,
    };
  }
  return {
    buildServiceAccount: gcb.getDefaultServiceAccount(projectNumber),
    runServiceAccount: gce.getDefaultServiceAccount(projectNumber),
  };
}

/**
 * Grants the corresponding service accounts the necessary access permissions to the provided secret.
 */
export async function grantSecretAccess(
  projectId: string,
  projectNumber: string,
  secretName: string,
  accounts: MultiServiceAccounts,
): Promise<void> {
  const p4saEmail = apphosting.serviceAgentEmail(projectNumber);
  const newBindings: iam.Binding[] = [
    {
      role: "roles/secretmanager.secretAccessor",
      members: [...accounts.buildServiceAccounts, ...accounts.runServiceAccounts].map(
        (sa) => `serviceAccount:${sa}`,
      ),
    },
    // Cloud Build needs the viewer role so that it can list secret versions and pin the Build to the
    // latest version.
    {
      role: "roles/secretmanager.viewer",
      members: accounts.buildServiceAccounts.map((sa) => `serviceAccount:${sa}`),
    },
    // The App Hosting service agent needs the version manager role for automated garbage collection.
    {
      role: "roles/secretmanager.secretVersionManager",
      members: [`serviceAccount:${p4saEmail}`],
    },
  ];

  let existingBindings;
  try {
    existingBindings = (await gcsm.getIamPolicy({ projectId, name: secretName })).bindings || [];
  } catch (err: any) {
    throw new FirebaseError(
      `Failed to get IAM bindings on secret: ${secretName}. Ensure you have the permissions to do so and try again.`,
      { original: err },
    );
  }

  try {
    // TODO: Merge with existing bindings with the same role
    const updatedBindings = existingBindings.concat(newBindings);
    await gcsm.setIamPolicy({ projectId, name: secretName }, updatedBindings);
  } catch (err: any) {
    throw new FirebaseError(
      `Failed to set IAM bindings ${JSON.stringify(newBindings)} on secret: ${secretName}. Ensure you have the permissions to do so and try again.`,
      { original: err },
    );
  }

  utils.logSuccess(`Successfully set IAM bindings on secret ${secretName}.\n`);
}

/**
 * Ensures a secret exists for use with app hosting, optionally locked to a region.
 * If a secret exists, we verify the user is not trying to change the region and verifies a secret
 * is not being used for both functions and app hosting as their garbage collection is incompatible
 * (client vs server-side).
 * @returns true if a secret was created, false if a secret already existed, and null if a user aborts.
 */
export async function upsertSecret(
  project: string,
  secret: string,
  location?: string,
): Promise<boolean | null> {
  let existing: gcsm.Secret;
  try {
    existing = await gcsm.getSecret(project, secret);
  } catch (err: any) {
    if (err.status !== 404) {
      throw new FirebaseError("Unexpected error loading secret", { original: err });
    }
    await gcsm.createSecret(project, secret, gcsm.labels("apphosting"), location);
    return true;
  }
  const replication = existing.replication?.userManaged;
  if (
    location &&
    (replication?.replicas?.length !== 1 || replication?.replicas?.[0]?.location !== location)
  ) {
    utils.logLabeledError(
      "apphosting",
      "Secret replication policies cannot be changed after creation",
    );
    return null;
  }
  if (isFunctionsManaged(existing)) {
    utils.logLabeledWarning(
      "apphosting",
      `Cloud Functions for Firebase currently manages versions of ${secret}. Continuing will disable ` +
        "automatic deletion of old versions.",
    );
    const stopTracking = await prompt.confirm({
      message: "Do you wish to continue?",
      default: false,
    });
    if (!stopTracking) {
      return null;
    }
    delete existing.labels[FIREBASE_MANAGED];
    await gcsm.patchSecret(project, secret, existing.labels);
  }
  // TODO: consider whether we should prompt a user who has an unmanaged secret to enroll in version control.
  // This may not be a great idea until version control is actually implemented.
  return false;
}

export async function getAppHostingConfigToExport(
  yamlPaths: string[],
): Promise<AppHostingReadableConfiguration> {
  const fileNameToPathMap: Map<string, string> = new Map();
  for (const path of yamlPaths) {
    const fileName = basename(path);
    fileNameToPathMap.set(fileName, path);
  }
  const baseFilePath = fileNameToPathMap.get(APPHOSTING_BASE_YAML_FILE);
  const fileToExportPath = await promptForAppHostingFileToExportSecretsFrom(fileNameToPathMap);

  let config = await loadAppHostingYaml(dirname(fileToExportPath), basename(fileToExportPath));

  // if the base file exists we'll include it
  if (baseFilePath) {
    const baseConfig = await loadAppHostingYaml(dirname(baseFilePath), basename(baseFilePath));

    // if the user had selected the base file only, thats okay becuase logic below won't alter the config or cause duplicates
    config = {
      ...config,
      ...baseConfig,
    };
  }

  return config;
}

async function promptForAppHostingFileToExportSecretsFrom(fileNameToPathMap: Map<string, string>) {
  const fileNames = Array.from(fileNameToPathMap.keys());

  const baseFilePath = fileNameToPathMap.get(APPHOSTING_BASE_YAML_FILE);
  const listOptions = fileNames.map((fileName) => {
    if (fileName === APPHOSTING_BASE_YAML_FILE) {
      return {
        name: `base (${APPHOSTING_BASE_YAML_FILE})`,
        value: baseFilePath,
      };
    }

    const environment = getEnvironmentNameFromYamlFileName(fileName);
    return {
      name: baseFilePath
        ? `${environment} (${APPHOSTING_BASE_YAML_FILE} + ${fileName})`
        : `${environment} (${fileName})`,
      value: fileNameToPathMap.get(fileName)!,
    };
  });

  const fileToExportPath = await prompt.promptOnce({
    name: "apphosting-yaml",
    type: "list",
    message: "Which environment would you like to export secrets from Secret Manager for?",
    choices: listOptions,
  });

  return fileToExportPath;
}

function getEnvironmentNameFromYamlFileName(fileName: string): string {
  const envrionmentRegex = /apphosting\.(.+)\.yaml/;
  const found = fileName.match(envrionmentRegex);

  if (!found) {
    throw new Error("Invalid apphosting environment file");
  }

  return found[1];
}
