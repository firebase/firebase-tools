import { bold } from "cli-color";

import * as track from "../../track";
import * as logger from "../../logger";
import { ensure } from "../../ensureApiEnabled";
import { logLabeledWarning } from "../../utils";
import { FirebaseError } from "../../error";

const FAQ_URL = "https://firebase.google.com/support/faq#functions-runtime";
const CLOUD_BUILD_API = "cloudbuild.googleapis.com";

function node8DeprecationWarning(): void {
  track("functions_runtime_notices", "nodejs8_deprecation_warning");
  logger.warn();
  logLabeledWarning(
    "functions",
    `The Node.js 8 runtime is deprecated and will be decommissioned on ${bold(
      "2021-03-15"
    )}. For more information, see: ${FAQ_URL}`
  );
  logger.warn();
}

function node10BillingError(projectId: string): FirebaseError {
  track("functions_runtime_notices", "nodejs10_billing_error");
  return new FirebaseError(
    `Cloud Functions deployment requires the pay-as-you-go (Blaze) billing plan. To upgrade your project, visit the following URL:
      
https://console.firebase.google.com/project/${projectId}/usage/details

For additional information about this requirement, see Firebase FAQs:

${FAQ_URL}`,
    { exit: 1 }
  );
}

function node10PermissionError(projectId: string): FirebaseError {
  track("functions_runtime_notices", "nodejs10_permission_error");
  return new FirebaseError(`Cloud Functions deployment requires the Cloud Build API to be enabled. The current credentials do not have permission to enable APIs for project ${bold(
    projectId
  )}.

Please ask a project owner to visit the following URL to enable Cloud Build:

https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=${projectId}

For additional information about this requirement, see Firebase FAQs:
${FAQ_URL}
`);
}

function isBillingError(e: {
  context?: {
    body?: {
      error?: {
        details?: { type: string; violations?: { type: string }[] }[];
      };
    };
  };
}): boolean {
  return !!e.context?.body?.error?.details?.find((d) =>
    d.violations?.find((v) => v.type === "serviceusage/billing-enabled")
  );
}

function isPermissionError(e: { context?: { body?: { error?: { status?: string } } } }): boolean {
  return e.context?.body?.error?.status === "PERMISSION_DENIED";
}

/**
 * Checks for various warnings and API enablements needed based on the runtime
 * of the deployed functions.
 *
 * @param projectId Project ID upon which to check enablement.
 * @param runtime The runtime as declared in package.json, e.g. `nodejs10`.
 */
export async function checkRuntimeDependencies(projectId: string, runtime: string): Promise<void> {
  // print deprecation warning for Node 8 functions once Cloud Build enforcement begins
  if (runtime === "nodejs8") {
    node8DeprecationWarning();
    return;
  }

  try {
    await ensure(projectId, CLOUD_BUILD_API, "functions");
  } catch (e) {
    if (isBillingError(e)) {
      throw node10BillingError(projectId);
    } else if (isPermissionError(e)) {
      throw node10PermissionError(projectId);
    }

    throw e;
  }
}
