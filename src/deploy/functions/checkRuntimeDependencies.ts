import { bold } from "cli-color";

import { configstore } from "../../configstore";
import * as logger from "../../logger";
import { ensure } from "../../ensureApiEnabled";
import { logLabeledWarning } from "../../utils";
import { FirebaseError } from "../../error";

const FAQ_URL = "https://firebase.google.com/support/faq#functions-runtime";
const CLOUD_BUILD_API = "cloudbuild.googleapis.com";

const DEFAULT_WARN_AFTER = 1588636800000; // 2020-05-05T00:00:00.000Z
const DEFAULT_ERROR_AFTER = 1591315200000; // 2020-06-05T00:00:00.000Z

const NODE8_DEPRECATION_WARNING = `The Node.js 8 runtime is deprecated and will be decommissioned on ${bold(
  "2020-12-05"
)}. For more information, see: ${FAQ_URL}`;

const NODE10_BILLING_WARNING = (errorAfter: number) =>
  `Cloud Functions will soon require the pay-as-you-go (Blaze) billing plan to deploy. To avoid service disruption, upgrade before ${bold(
    new Date(errorAfter).toISOString().substr(0, 10)
  )}. For more information, see: ${FAQ_URL}`;

const NODE10_BILLING_ERROR = (
  projectId: string
) => `Cloud Functions deployment requires the pay-as-you-go (Blaze) billing plan. To upgrade your project, visit the following URL:
      
https://console.firebase.google.com/project/${projectId}/usage/details

For additional information about this requirement, see Firebase FAQs:

${FAQ_URL}`;

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

/**
 * Checks for various warnings and API enablements needed based on the runtime
 * of the deployed functions.
 *
 * @param projectId Project ID upon which to check enablement.
 */
export async function checkRuntimeDependencies(projectId: string, runtime: string): Promise<void> {
  const warnAfter = Date.now() - 10000; // configstore.get("motd.cloudBuildWarnAfter") || DEFAULT_WARN_AFTER;
  const errorAfter = configstore.get("motd.cloudBuildErrorAfter") || DEFAULT_ERROR_AFTER;
  const now = Date.now();

  const shouldError = now > errorAfter;

  // we don't need to warn or error if it's currently before all time checks
  if (now < warnAfter) {
    return;
  }

  // print deprecation warning for Node 8 functions once Cloud Build enforcement begins
  if (shouldError && runtime === "nodejs8") {
    logger.warn();
    logLabeledWarning("functions", NODE8_DEPRECATION_WARNING);
    logger.warn();
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
        throw new FirebaseError(NODE10_BILLING_ERROR(projectId), {
          exit: 1,
        });
      }

      logger.warn();
      logLabeledWarning("functions", NODE10_BILLING_WARNING(errorAfter));
      logger.warn();
      return;
    }

    throw e;
  }
}
