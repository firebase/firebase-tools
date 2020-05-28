import { bold } from "cli-color";

import * as track from "../../track";
import { configstore } from "../../configstore";
import * as logger from "../../logger";
import { ensure } from "../../ensureApiEnabled";
import { logLabeledWarning } from "../../utils";
import { FirebaseError } from "../../error";

const FAQ_URL = "https://firebase.google.com/support/faq#functions-runtime";
const CLOUD_BUILD_API = "cloudbuild.googleapis.com";

const DEFAULT_WARN_AFTER = 1588636800000; // 2020-05-05T00:00:00.000Z
const DEFAULT_ERROR_AFTER = 1591315200000; // 2020-06-05T00:00:00.000Z

function node8DeprecationWarning(): void {
  track("functions_runtime_notices", "nodejs8_deprecation_warning");
  logger.warn();
  logLabeledWarning(
    "functions",
    `The Node.js 8 runtime is deprecated and will be decommissioned on ${bold(
      "2020-12-05"
    )}. For more information, see: ${FAQ_URL}`
  );
  logger.warn();
}

function node10BillingWarning(errorAfter: number): void {
  track("functions_runtime_notices", "nodejs10_billing_warning");
  logger.warn();
  logLabeledWarning(
    "functions",
    `Cloud Functions will soon require the pay-as-you-go (Blaze) billing plan to deploy. To avoid service disruption, upgrade before ${bold(
      new Date(errorAfter).toISOString().substr(0, 10)
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

function node10PermissionWarning(errorAfter: number, projectId: string): void {
  track("functions_runtime_notices", "nodejs10_permission_warning");
  logger.warn();
  logLabeledWarning(
    "functions",
    `Cloud Functions will soon require the Cloud Build API to be enabled on your project to deploy. To avoid service disruption, please ask a project owner to enable the API before ${bold(
      new Date(errorAfter).toISOString().substr(0, 10)
    )}.`
  );
  logLabeledWarning(
    "functions",
    `Enable URL: https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=${projectId}`
  );
  logLabeledWarning("functions", `Additional Information: ${FAQ_URL}`);
  logger.warn();
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
  const warnAfter = configstore.get("motd.cloudBuildWarnAfter") || DEFAULT_WARN_AFTER;
  const errorAfter = configstore.get("motd.cloudBuildErrorAfter") || DEFAULT_ERROR_AFTER;
  const now = Date.now();

  const shouldError = now > errorAfter;

  logger.debug(
    "[functions] runtime dependency check dates: warning:",
    new Date(warnAfter).toISOString(),
    "error:",
    new Date(errorAfter).toISOString()
  );

  // we don't need to warn or error if it's currently before all time checks
  if (now < warnAfter) {
    return;
  }

  // print deprecation warning for Node 8 functions once Cloud Build enforcement begins
  if (shouldError && runtime === "nodejs8") {
    node8DeprecationWarning();
    return;
  }

  // everything from this point only applies to node10
  if (runtime !== "nodejs10") {
    return;
  }

  try {
    await ensure(projectId, CLOUD_BUILD_API, "functions");
  } catch (e) {
    if (isBillingError(e)) {
      if (shouldError) {
        throw node10BillingError(projectId);
      }

      node10BillingWarning(errorAfter);
      return;
    } else if (isPermissionError(e)) {
      if (shouldError) {
        throw node10PermissionError(projectId);
      }

      node10PermissionWarning(errorAfter, projectId);
      return;
    }

    throw e;
  }
}
