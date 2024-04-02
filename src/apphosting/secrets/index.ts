import { FirebaseError } from "../../error";
import * as iam from "../../gcp/iam";
import * as gcsm from "../../gcp/secretManager";
import * as gcb from "../../gcp/cloudbuild";
import * as gce from "../../gcp/computeEngine";
import { FIREBASE_MANAGED } from "../../gcp/secretManager";
import { isFunctionsManaged } from "../../gcp/secretManager";
import * as utils from "../../utils";
import * as prompt from "../../prompt";

function fetchServiceAccounts(projectNumber: string): {
  buildServiceAccount: string;
  runServiceAccount: string;
} {
  // TODO: For now we will always return the default CBSA and CESA. When the getBackend call supports returning
  // the attached service account in a given backend/location then return that value instead.
  // Sample Call: await apphosting.getBackend(projectId, location, backendId); & make this function async
  return {
    buildServiceAccount: gcb.getDefaultServiceAccount(projectNumber),
    runServiceAccount: gce.getDefaultServiceAccount(projectNumber),
  };
}

/**
 * Grants the corresponding service accounts the necessary access permissions to the provided secret.
 */
export async function grantSecretAccess(
  secretName: string,
  location: string,
  backendId: string,
  projectId: string,
  projectNumber: string,
): Promise<void> {
  const isExist = await gcsm.secretExists(projectId, secretName);
  if (!isExist) {
    throw new FirebaseError(`Secret ${secretName} does not exist in project ${projectId}`);
  }

  let serviceAccounts = { buildServiceAccount: "", runServiceAccount: "" };
  try {
    serviceAccounts = fetchServiceAccounts(projectNumber);
  } catch (err: any) {
    throw new FirebaseError(
      `Failed to get backend ${backendId} at location ${location}. Please check the parameters you have provided.`,
      { original: err },
    );
  }

  const secret = {
    projectId: projectId,
    name: secretName,
  };

  // TODO: Document why Cloud Build SA needs viewer permission but Run doesn't.
  // TODO: future proof for when therte is a single service account (currently will set the same
  // secretAccessor permission twice)
  const newBindings: iam.Binding[] = [
    {
      role: "roles/secretmanager.secretAccessor",
      members: [
        `serviceAccount:${serviceAccounts.buildServiceAccount}`,
        `serviceAccount:${serviceAccounts.runServiceAccount}`,
      ],
    },
    // Cloud Build needs the viewer role so that it can list secret versions and pin the Build to the
    // latest version.
    {
      role: "roles/secretmanager.viewer",
      members: [`serviceAccount:${serviceAccounts.buildServiceAccount}`],
    },
  ];

  let existingBindings;
  try {
    existingBindings = (await gcsm.getIamPolicy(secret)).bindings;
  } catch (err: any) {
    throw new FirebaseError(
      `Failed to get IAM bindings on secret: ${secret.name}. Ensure you have the permissions to do so and try again.`,
      { original: err },
    );
  }

  try {
    // TODO: Merge with existing bindings with the same role
    const updatedBindings = existingBindings.concat(newBindings);
    await gcsm.setIamPolicy(secret, updatedBindings);
  } catch (err: any) {
    throw new FirebaseError(
      `Failed to set IAM bindings ${JSON.stringify(newBindings)} on secret: ${secret.name}. Ensure you have the permissions to do so and try again.`,
      { original: err },
    );
  }

  utils.logSuccess(`Successfully set IAM bindings on secret ${secret.name}.\n`);
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
