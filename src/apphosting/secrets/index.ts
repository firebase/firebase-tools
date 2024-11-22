import { FirebaseError, getErrStatus, getError } from "../../error";
import * as iam from "../../gcp/iam";
import * as gcsm from "../../gcp/secretManager";
import * as gcb from "../../gcp/cloudbuild";
import * as gce from "../../gcp/computeEngine";
import * as apphosting from "../../gcp/apphosting";
import { FIREBASE_MANAGED } from "../../gcp/secretManager";
import { isFunctionsManaged } from "../../gcp/secretManager";
import * as utils from "../../utils";
import * as prompt from "../../prompt";
import { Secret } from "../yaml";

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
  } catch (err: unknown) {
    throw new FirebaseError(
      `Failed to get IAM bindings on secret: ${secretName}. Ensure you have the permissions to do so and try again.`,
      { original: getError(err) },
    );
  }

  try {
    // TODO: Merge with existing bindings with the same role
    const updatedBindings = existingBindings.concat(newBindings);
    await gcsm.setIamPolicy({ projectId, name: secretName }, updatedBindings);
  } catch (err: unknown) {
    throw new FirebaseError(
      `Failed to set IAM bindings ${JSON.stringify(newBindings)} on secret: ${secretName}. Ensure you have the permissions to do so and try again.`,
      { original: getError(err) },
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
  } catch (err: unknown) {
    if (getErrStatus(err) !== 404) {
      throw new FirebaseError("Unexpected error loading secret", { original: getError(err) });
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

/**
 * Fetches secrets from Google Secret Manager and returns their values in plain text.
 */
export async function fetchSecrets(
  projectId: string,
  secrets: Secret[],
): Promise<Map<string, string>> {
  let secretsKeyValuePairs: Map<string, string>;

  try {
    const secretPromises: Promise<[string, string]>[] = secrets.map(async (secretConfig) => {
      const [name, version] = getSecretNameParts(secretConfig.secret!);

      const value = await gcsm.accessSecretVersion(projectId, name, version);
      return [secretConfig.variable, value] as [string, string];
    });

    const secretEntries = await Promise.all(secretPromises);
    secretsKeyValuePairs = new Map(secretEntries);
  } catch (e: any) {
    throw new FirebaseError(`Error exporting secrets`, {
      original: e,
    });
  }

  return secretsKeyValuePairs;
}

/**
 * secret expected to be in format "myApiKeySecret@5",
 * "projects/test-project/secrets/secretID", or
 * "projects/test-project/secrets/secretID/versions/5"
 */
export function getSecretNameParts(secret: string): [string, string] {
  let [name, version] = secret.split("@");
  if (!version) {
    version = "latest";
  }

  return [name, version];
}
