import { FirebaseError } from "../error";
import * as extensionsApi from "./extensionsApi";
import { logPrefix } from "./extensionsHelper";
import { promptOnce } from "../prompt";
import * as utils from "../utils";

const billingMsgUpdate =
  "This update includes an upgrade to Node.js 10 from Node.js 8, which is no" +
  " longer maintained. Starting with this update, you will be charged a" +
  " small amount (typically around $0.01/month) for each instance of this" +
  " extension you've installed, in addition to any charges associated with" +
  " your use of Firebase services.\n\n" +
  "See pricing examples: https://cloud.google.com/functions/pricing#pricing_examples\n" +
  "See the FAQ: https://firebase.google.com/support/faq/#extensions-runtime";
const billingMsgCreate =
  "You will be charged around $0.01/month for each instance of this extension" +
  " you install. Additionally, using this extension will contribute to your" +
  " project's overall usage level of Firebase services. However, you'll only" +
  " be charged for usage that exceeds Firebase's free tier for those" +
  " services.\n\n" +
  "See pricing examples: https://cloud.google.com/functions/pricing#pricing_examples\n" +
  "Learn about Firebase pricing: https://firebase.google.com/pricing";

const defaultSpecVersion = "v1beta";
const defaultRuntimes: { [key: string]: string } = {
  v1beta: "nodejs8",
};

function hasRuntime(spec: extensionsApi.ExtensionSpec, runtime: string): boolean {
  const specVersion = spec.specVersion || defaultSpecVersion;
  const defaultRuntime = defaultRuntimes[specVersion];
  const resources = spec.resources || [];
  return resources.some((r) => runtime === (r.properties?.runtime || defaultRuntime));
}

/**
 * Displays billing changes if the update contains new billing requirements.
 *
 * @param curSpec A current extensionSpec
 * @param newSpec A extensionSpec to compare to
 * @param prompt If true, prompts user for confirmation
 */
export async function displayUpdateBillingNotice(
  curSpec: extensionsApi.ExtensionSpec,
  newSpec: extensionsApi.ExtensionSpec,
  prompt: boolean
): Promise<void> {
  if (hasRuntime(curSpec, "nodejs8") && hasRuntime(newSpec, "nodejs10")) {
    utils.logLabeledWarning(logPrefix, billingMsgUpdate);

    if (prompt) {
      const continueUpdate = await promptOnce({
        type: "confirm",
        message: "Do you wish to continue?",
        default: true,
      });
      if (!continueUpdate) {
        throw new FirebaseError(`Cancelled.`, { exit: 2 });
      }
    }
  }
}

/**
 * Displays billing changes if the extension contains new billing requirements.
 *
 * @param spec A currenta extensionSpec
 * @param prompt If true, prompts user for confirmation
 */
export async function displayCreateBillingNotice(
  spec: extensionsApi.ExtensionSpec,
  prompt: boolean
): Promise<void> {
  if (hasRuntime(spec, "nodejs10")) {
    utils.logLabeledWarning(logPrefix, billingMsgCreate);
    if (prompt) {
      const continueUpdate = await promptOnce({
        type: "confirm",
        message: "Do you wish to continue?",
        default: true,
      });
      if (!continueUpdate) {
        throw new FirebaseError(`Cancelled.`, { exit: 2 });
      }
    }
  }
}
