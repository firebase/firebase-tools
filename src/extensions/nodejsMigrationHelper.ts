import { FirebaseError } from "../error";
import * as extensionsApi from "./extensionsApi";
import { logPrefix } from "./extensionsHelper";
import { promptOnce } from "../prompt";
import * as utils from "../utils";

const billingMsgUpdate =
  "This update includes an upgrade to Node.js 10 from Node.js 8, which is no longer maintained. Node.js 10 requires your project to be on the Blaze (pay as you go) plan, and starting with this update, you will be charged a small amount (typically around $0.01/month) for each instance of this extension you've installed, in addition to any charges associated with your use of Firebase services.";
const billingMsgCreate =
  "You will be charged around $0.01/month for each instance of this extension"
  + " you install. Additionally, using this extension will contribute to your"
  + " project's overall usage level of Firebase services. However, you'll only"
  + " be charged for usage that exceeds Firebase's free tier for those"
  + " services.\n\n"
  + "See pricing examples: https://TBD\n"
  + "Learn about Firebase pricing: https://firebase.google.com/pricing";

function hasRuntime(resource: extensionsApi.Resource, runtime: string): boolean {
  let resourceRuntime = "nodejs8"; // default to nodejs8 runtime
  if (resource.properties?.runtime) {
    resourceRuntime = resource.properties.runtime;
  }
  return resourceRuntime == runtime;
}

function shouldDisplayMsg(
  newSpec: extensionsApi.ExtensionSpec,
  curSpec?: extensionsApi.ExtensionSpec
): boolean {
  const newResources = newSpec.resources;
  const curResources = curSpec?.resources || [];
  const newResourcesUseNode10 = newResources.some((r) => hasRuntime(r, "nodejs10"));
  const curResourcesUseNode8 = curResources.some((r) => hasRuntime(r, "nodejs8"));
  return newResourcesUseNode10 && (!curSpec || curResourcesUseNode8);
}

/**
 * Displays nodejs10 billing changes if the update contains a change to nodejs10 runtime.
 *
 * @param newSpec A extensionSpec to compare to
 * @param curSpec A current extensionSpec
 * @param update Display update message if true
 * @return Displayed message
 */
export async function displayNodejsBillingNotice(
  newSpec: extensionsApi.ExtensionSpec,
  curSpec?: extensionsApi.ExtensionSpec,
  update?: boolean
): Promise<void> {
  if (shouldDisplayMsg(newSpec, curSpec)) {
    const msg = update ? billingMsgUpdate : billingMsgCreate;

    utils.logLabeledWarning(logPrefix, msg);
    const continueUpdate = await promptOnce({
      type: "confirm",
      message: "Do you wish to continue?",
      default: false,
    });
    if (!continueUpdate) {
      throw new FirebaseError(`Cancelled.`, { exit: 2 });
    }
  }
}
