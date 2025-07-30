import { addServiceAccountToRoles, serviceAccountHasRoles } from "../gcp/resourceManager";
import { ensure } from "../ensureApiEnabled";
import { appTestingOrigin, artifactRegistryDomain, cloudRunApiOrigin, storageOrigin } from "../api";
import { logBullet, logWarning } from "../utils";
import { FirebaseError, getErrStatus } from "../error";
import * as iam from "../gcp/iam";
import { confirm } from "../prompt";

const TEST_RUNNER_ROLE = "roles/firebaseapptesting.testRunner";
const TEST_RUNNER_SERVICE_ACCOUNT_NAME = "firebaseapptesting-test-runner";

export async function ensureProjectConfigured(projectId: string) {
  await ensure(projectId, appTestingOrigin(), "Firebase App Testing", false);
  await ensure(projectId, cloudRunApiOrigin(), "Cloud Run", false);
  await ensure(projectId, storageOrigin(), "Cloud Storage", false);
  await ensure(projectId, artifactRegistryDomain(), "Artifact Registry", false);
  const serviceAccount = runnerServiceAccount(projectId);

  const serviceAccountExistsAndIsRunner = await serviceAccountHasRoles(
    projectId,
    serviceAccount,
    [TEST_RUNNER_ROLE],
    true,
  );
  if (!serviceAccountExistsAndIsRunner) {
    const grant = await confirm(
      `Firebase App Testing runs tests in Cloud Run using a service account, provision an account, "${serviceAccount}", with the role "${TEST_RUNNER_ROLE}"?`,
    );
    if (!grant) {
      logBullet(
        "You, or your project administrator, should run the following command to grant the required role:\n\n" +
          `\tgcloud projects add-iam-policy-binding ${projectId} \\\n` +
          `\t  --member="serviceAccount:${serviceAccount}" \\\n` +
          `\t  --role="${TEST_RUNNER_ROLE}"\n`,
      );
      throw new FirebaseError(
        `Firebase App Testing requires a service account named "${serviceAccount}" with the "${TEST_RUNNER_ROLE}" role to execute tests using Cloud Run`,
      );
    }
    await provisionServiceAccount(projectId, serviceAccount);
  }
}

async function provisionServiceAccount(projectId: string, serviceAccount: string): Promise<void> {
  try {
    await iam.createServiceAccount(
      projectId,
      TEST_RUNNER_SERVICE_ACCOUNT_NAME,
      "Service Account used in Cloud Run, responsible for running tests",
      "Firebase App Testing Test Runner",
    );
  } catch (err: unknown) {
    // 409 Already Exists errors can safely be ignored.
    if (getErrStatus(err) !== 409) {
      throw err;
    }
  }
  try {
    await addServiceAccountToRoles(
      projectId,
      serviceAccount,
      [TEST_RUNNER_ROLE],
      /* skipAccountLookup= */ true,
    );
  } catch (err: unknown) {
    if (getErrStatus(err) === 400) {
      logWarning(
        `Your App Testing runner service account, "${serviceAccount}", is still being provisioned in the background. If you encounter an error, please try again after a few moments.`,
      );
    } else {
      throw err;
    }
  }
}

function runnerServiceAccount(projectId: string): string {
  return `${TEST_RUNNER_SERVICE_ACCOUNT_NAME}@${projectId}.iam.gserviceaccount.com`;
}
