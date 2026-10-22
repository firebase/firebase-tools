import * as clc from "colorette";

import * as ensureApiEnabled from "../../ensureApiEnabled";
import { FirebaseError, isBillingError } from "../../error";
import { logLabeledBullet, logLabeledSuccess } from "../../utils";
import { checkServiceAgentRole, ensureServiceAgentRole } from "../../gcp/secretManager";
import { getProject, ProjectInfo } from "../../management/projects";
import { assertExhaustive } from "../../functional";
import { cloudbuildOrigin } from "../../api";
import * as backend from "./backend";
import { getDefaultServiceAccount } from "../../gcp/computeEngine";
import { logger } from "../../logger";

const FAQ_URL = "https://firebase.google.com/support/faq#functions-runtime";

const metadataCallCache: Map<string, Promise<ProjectInfo>> = new Map();

/**
 *  By default:
 *    1. GCFv1 uses App Engine default service account.
 *    2. GCFv2 (Cloud Run) uses Compute Engine default service account.
 */
export async function defaultServiceAccount(e: backend.Endpoint): Promise<string> {
  let metadataCall = metadataCallCache.get(e.project);
  if (!metadataCall) {
    metadataCall = getProject(e.project);
    metadataCallCache.set(e.project, metadataCall);
  }
  const metadata = await metadataCall;
  if (e.platform === "gcfv1") {
    return `${metadata.projectId}@appspot.gserviceaccount.com`;
  } else if (e.platform === "gcfv2" || e.platform === "run") {
    return await getDefaultServiceAccount(metadata.projectNumber);
  }
  assertExhaustive(e.platform);
}

function nodeBillingError(projectId: string): FirebaseError {
  return new FirebaseError(
    `Cloud Functions deployment requires the pay-as-you-go (Blaze) billing plan. To upgrade your project, visit the following URL:

https://console.firebase.google.com/project/${projectId}/usage/details

For additional information about this requirement, see Firebase FAQs:

${FAQ_URL}`,
    { exit: 1 },
  );
}

function nodePermissionError(projectId: string): FirebaseError {
  return new FirebaseError(`Cloud Functions deployment requires the Cloud Build API to be enabled. The current credentials do not have permission to enable APIs for project ${clc.bold(
    projectId,
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
    await ensureApiEnabled.ensure(projectId, cloudbuildOrigin(), "functions");
  } catch (e: any) {
    if (isBillingError(e)) {
      throw nodeBillingError(projectId);
    } else if (isPermissionError(e)) {
      throw nodePermissionError(projectId);
    }

    throw e;
  }
}

/**
 * Returns a mapping of all secrets declared in a stack to the bound service accounts.
 */
async function secretsToServiceAccounts(b: backend.Backend): Promise<Record<string, Set<string>>> {
  const secretsToSa: Record<string, Set<string>> = {};
  for (const e of backend.allEndpoints(b)) {
    if (!e.secretEnvironmentVariables || e.secretEnvironmentVariables.length === 0) {
      continue;
    }
    // BUG BUG BUG? Test whether we've resolved e.serviceAccount to be project-relative
    // by this point.
    const sa = e.serviceAccount || ((await module.exports.defaultServiceAccount(e)) as string);
    for (const s of e.secretEnvironmentVariables) {
      const serviceAccounts = secretsToSa[s.secret] || new Set();
      serviceAccounts.add(sa);
      secretsToSa[s.secret] = serviceAccounts;
    }
  }
  return secretsToSa;
}

/**
 * Returns a mapping of secret names to service account emails that require access to them.
 */
export async function secretsAccessDelta(args: {
  projectId: string;
  wantBackend: backend.Backend;
  haveBackend: backend.Backend;
}): Promise<Record<string, string[]>> {
  const { wantBackend, haveBackend } = args;
  const wantSecrets = await secretsToServiceAccounts(wantBackend);
  const haveSecrets = await secretsToServiceAccounts(haveBackend);

  // Remove secret/service account pairs that already exist to avoid unnecessary IAM calls.
  for (const [secret, serviceAccounts] of Object.entries(haveSecrets)) {
    for (const serviceAccount of serviceAccounts) {
      wantSecrets[secret]?.delete(serviceAccount);
    }
    if (wantSecrets[secret]?.size === 0) {
      delete wantSecrets[secret];
    }
  }

  const delta: Record<string, string[]> = {};
  for (const [secret, serviceAccounts] of Object.entries(wantSecrets)) {
    if (serviceAccounts.size > 0) {
      delta[secret] = Array.from(serviceAccounts);
    }
  }
  return delta;
}

/**
 * Checks secret access in dry run mode and logs messages for permissions to be granted.
 */
export async function checkSecretAccess(
  projectId: string,
  secretAccessDelta: Record<string, string[]>,
): Promise<void> {
  for (const [secret, serviceAccounts] of Object.entries(secretAccessDelta)) {
    logLabeledBullet(
      "functions",
      `ensuring ${clc.bold(serviceAccounts.join(", "))} access to secret ${clc.bold(secret)}.`,
    );
    const check = await checkServiceAgentRole(
      { name: secret, projectId },
      serviceAccounts,
      "roles/secretmanager.secretAccessor",
    );
    if (check.length) {
      logLabeledBullet(
        "functions",
        `On your next deploy, ${clc.bold(serviceAccounts.join(", "))} will be granted access to secret ${clc.bold(secret)}.`,
      );
    }
  }
}

/**
 * Grants secret access for a single secret to specified service accounts.
 */
export async function grantSecretAccess(args: {
  projectId: string;
  secret: string;
  serviceAccounts: string[];
}): Promise<void> {
  const { projectId, secret, serviceAccounts } = args;
  logLabeledBullet(
    "functions",
    `ensuring ${clc.bold(serviceAccounts.join(", "))} access to secret ${clc.bold(secret)}.`,
  );
  await ensureServiceAgentRole(
    { name: secret, projectId },
    serviceAccounts,
    "roles/secretmanager.secretAccessor",
  );
  logLabeledSuccess(
    "functions",
    `ensured ${clc.bold(serviceAccounts.join(", "))} access to ${clc.bold(secret)}.`,
  );
}

export const REQUIRED_SECURITY_APIS = [
  "iam.googleapis.com",
  "cloudresourcemanager.googleapis.com",
] as const;

/**
 * Validates that the Google Cloud APIs required for Declarative Security are enabled.
 * Fails fast with an actionable gcloud command and console URLs if either API is disabled.
 */
export async function checkDeclarativeSecurityApisEnabled(
  projectId: string,
  codebase: string,
): Promise<void> {
  const checks = await Promise.all(
    REQUIRED_SECURITY_APIS.map(async (api) => {
      try {
        return await ensureApiEnabled.check(projectId, api, "functions", /* silent= */ true);
      } catch (err: unknown) {
        const isPermissionDenied =
          (err as { status?: number })?.status === 403 ||
          isPermissionError(err as { context?: { body?: { error?: { status?: string } } } });
        if (isPermissionDenied) {
          logger.debug(`Silencing permission error checking enablement for API ${api}:`, err);
          return true;
        }
        throw err;
      }
    }),
  );
  const disabledApis = REQUIRED_SECURITY_APIS.filter((_, idx) => !checks[idx]);

  if (disabledApis.length > 0) {
    const apiBulletList = disabledApis.map((api) => `  - ${clc.bold(api)}`).join("\n");
    const enableCmd = clc.bold(
      `gcloud services enable ${disabledApis.join(" ")} --project ${projectId}`,
    );
    const consoleLinks = disabledApis
      .map((api) => `  - ${api}: ${ensureApiEnabled.enableApiURI(projectId, api)}`)
      .join("\n");

    throw new FirebaseError(
      `Cannot deploy functions with declarative security in codebase "${codebase}". ` +
        `The following required Google Cloud API(s) are not enabled on project ${clc.bold(projectId)}:\n` +
        apiBulletList +
        `\n\nDeclarative security requires these APIs to provision and configure managed service accounts and IAM roles.\n` +
        `To enable them, run:\n\n` +
        `  ${enableCmd}\n\n` +
        `Or ask a project owner to enable them in the Google Cloud Console:\n` +
        consoleLinks +
        `\n`,
      { exit: 1 },
    );
  }
}
