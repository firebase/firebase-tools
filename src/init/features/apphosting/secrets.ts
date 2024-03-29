import { logSuccess } from "../../../utils";
import * as iam from "../../../gcp/iam";
import * as gcb from "../../../gcp/cloudbuild";
import * as secretManager from "../../../gcp/secretManager";
import { FirebaseError } from "../../../error";

function fetchServiceAccounts(projectNumber: string): {
  buildServiceAccount: string;
  runServiceAccount: string;
} {
  // TODO: For now we will always return the default CBSA and CESA. When the getBackend call supports returning
  // the attached service account in a given backend/location then return that value instead.
  // Sample Call: await apphosting.getBackend(projectId, location, backendId); & make this function async
  return {
    buildServiceAccount: gcb.getDefaultCloudBuildServiceAgent(projectNumber),
    runServiceAccount: gcb.getDefaultComputeEngineServiceAgent(projectNumber),
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
  const isExist = await secretManager.secretExists(projectId, secretName);
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

  const secret: secretManager.Secret = {
    projectId: projectId,
    name: secretName,
  };

  const newBindings: iam.Binding[] = [
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
    const existingBindings = (await secretManager.getIamPolicy(secret)).bindings;
    const updatedBindings = updateBindings(existingBindings, newBindings);
    await secretManager.setIamPolicy(secret, updatedBindings);
  } catch (err: any) {
    throw new FirebaseError(
      `Failed to set IAM bindings ${JSON.stringify(newBindings)} on secret: ${secret.name}. Ensure you have the permissions to do so and try again.`,
      { original: err },
    );
  }

  logSuccess(`Successfully set IAM bindings on secret ${secret.name}.\n`);
}

function updateBindings(existing: iam.Binding[], newBindings: iam.Binding[]): iam.Binding[] {
  const updatedBindings: iam.Binding[] = existing ? [...existing] : [];

  for (const newBinding of newBindings) {
    const existingRoleIndex = updatedBindings.findIndex((b) => b.role === newBinding.role);

    if (existingRoleIndex >= 0) {
      // Role exists, update members selectively
      newBinding.members.forEach((newMember) => {
        if (!updatedBindings[existingRoleIndex].members.includes(newMember)) {
          updatedBindings[existingRoleIndex].members.push(newMember);
        }
      });
    } else {
      // Role doesn't exist, add the new binding
      updatedBindings.push(newBinding);
    }
  }

  return updatedBindings;
}
