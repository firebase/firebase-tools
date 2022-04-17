import * as clc from "cli-color";

import { ensure } from "../../ensureApiEnabled";
import { FirebaseError, isBillingError } from "../../error";
import { logLabeledBullet, logLabeledSuccess } from "../../utils";
import { ensureServiceAgentRole } from "../../gcp/secretManager";
import { previews } from "../../previews";
import { getFirebaseProject } from "../../management/projects";
import { assertExhaustive } from "../../functional";
import { track } from "../../track";
import * as backend from "./backend";
import * as ensureApiEnabled from "../../ensureApiEnabled";

const FAQ_URL = "https://firebase.google.com/support/faq#functions-runtime";
const CLOUD_BUILD_API = "cloudbuild.googleapis.com";

/**
 *  By default:
 *    1. GCFv1 uses App Engine default service account.
 *    2. GCFv2 (Cloud Run) uses Compute Engine default service account.
 */
export async function defaultServiceAccount(e: backend.Endpoint): Promise<string> {
  const metadata = await getFirebaseProject(e.project);
  if (e.platform === "gcfv1") {
    return `${metadata.projectId}@appspot.gserviceaccount.com`;
  } else if (e.platform === "gcfv2") {
    return `${metadata.projectNumber}-compute@developer.gserviceaccount.com`;
  }
  assertExhaustive(e.platform);
}

function nodeBillingError(projectId: string): FirebaseError {
  void track("functions_runtime_notices", "nodejs10_billing_error");
  return new FirebaseError(
    `Cloud Functions deployment requires the pay-as-you-go (Blaze) billing plan. To upgrade your project, visit the following URL:

https://console.firebase.google.com/project/${projectId}/usage/details

For additional information about this requirement, see Firebase FAQs:

${FAQ_URL}`,
    { exit: 1 }
  );
}

function nodePermissionError(projectId: string): FirebaseError {
  void track("functions_runtime_notices", "nodejs10_permission_error");
  return new FirebaseError(`Cloud Functions deployment requires the Cloud Build API to be enabled. The current credentials do not have permission to enable APIs for project ${clc.bold(
    projectId
  )}.

Please ask a project owner to visit the following URL to enable Cloud Build:

https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=${projectId}

For additional information about this requirement, see Firebase FAQs:
${FAQ_URL}
`);
}

function isPermissionError(e: { context?: { body?: { error?: { status?: string } } } }): boolean {
  return e.context?.body?.error?.status === "PERMISSION_DENIED";
}

/**
 * Checks for various warnings and API enablements needed based on the runtime
 * of the deployed functions.
 *
 * @param projectId Project ID upon which to check enablement.
 */
export async function cloudBuildEnabled(projectId: string): Promise<void> {
  try {
    await ensure(projectId, CLOUD_BUILD_API, "functions");
  } catch (e: any) {
    if (isBillingError(e)) {
      throw nodeBillingError(projectId);
    } else if (isPermissionError(e)) {
      throw nodePermissionError(projectId);
    }

    throw e;
  }
}

// We previously force-enabled AR. We want to wait on this to see if we can give
// an upgrade warning in the future. If it already is enabled though we want to
// remember this and still use the cleaner if necessary.
export async function maybeEnableAR(projectId: string): Promise<boolean> {
  if (!previews.artifactregistry) {
    return ensureApiEnabled.check(
      projectId,
      "artifactregistry.googleapis.com",
      "functions",
      /* silent= */ true
    );
  }
  await ensureApiEnabled.ensure(projectId, "artifactregistry.googleapis.com", "functions");
  return true;
}

/**
 * Returns a mapping of all secrets declared in a stack to the bound service accounts.
 */
async function secretsToServiceAccounts(b: backend.Backend): Promise<Record<string, Set<string>>> {
  const secretsToSa: Record<string, Set<string>> = {};
  for (const e of backend.allEndpoints(b)) {
    const sa = e.serviceAccountEmail || (await module.exports.defaultServiceAccount(e));
    for (const s of e.secretEnvironmentVariables! || []) {
      const serviceAccounts = secretsToSa[s.secret] || new Set();
      serviceAccounts.add(sa);
      secretsToSa[s.secret] = serviceAccounts;
    }
  }
  return secretsToSa;
}

/**
 * Ensures that runtime service account has access to the secrets.
 *
 * To avoid making more than one simultaneous call to setIamPolicy calls per secret, the function batches all
 * service account that requires access to it.
 */
export async function secretAccess(
  projectId: string,
  wantBackend: backend.Backend,
  haveBackend: backend.Backend
) {
  const ensureAccess = async (secret: string, serviceAccounts: string[]) => {
    logLabeledBullet(
      "functions",
      `ensuring ${clc.bold(serviceAccounts.join(", "))} access to secret ${clc.bold(secret)}.`
    );
    await ensureServiceAgentRole(
      { name: secret, projectId },
      serviceAccounts,
      "roles/secretmanager.secretAccessor"
    );
    logLabeledSuccess(
      "functions",
      `ensured ${clc.bold(serviceAccounts.join(", "))} access to ${clc.bold(secret)}.`
    );
  };

  const wantSecrets = await secretsToServiceAccounts(wantBackend);
  const haveSecrets = await secretsToServiceAccounts(haveBackend);

  // Remove secret/service account pairs that already exists to avoid unnecessary IAM calls.
  for (const [secret, serviceAccounts] of Object.entries(haveSecrets)) {
    for (const serviceAccount of serviceAccounts) {
      wantSecrets[secret]?.delete(serviceAccount);
    }
    if (wantSecrets[secret]?.size === 0) {
      delete wantSecrets[secret];
    }
  }

  const ensure = [];
  for (const [secret, serviceAccounts] of Object.entries(wantSecrets)) {
    ensure.push(ensureAccess(secret, Array.from(serviceAccounts)));
  }
  await Promise.all(ensure);
}
