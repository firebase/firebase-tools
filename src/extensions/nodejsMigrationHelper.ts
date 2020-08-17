import { FirebaseError } from "../error";
import * as extensionsApi from "./extensionsApi";
import { logPrefix } from "./extensionsHelper";
import { promptOnce } from "../prompt";
import * as utils from "../utils";

const changeMsg =
  "Node.js 8 has been deprecated. It’s recommended to update this extension to ensure it is running on Node.js 10.";
const billingMsgUpdate =
  "This update includes an upgrade to Node.js 10 from Node.js 8, which is no longer maintained. Node.js 10 requires your project to be on the Blaze (pay as you go) plan, and starting with this update, you will be charged a small amount (typically around $0.01/month) for each instance of this extension you've installed, in addition to any charges associated with your use of Firebase services.";
const billingMsgCreate =
  "This extension includes Node.js 10 functions. Node.js 10 requires your project to be on the Blaze (pay as you go) plan, and you will be charged a small amount (typically around $0.01/month) for each instance of this extension you've installed, in addition to any charges associated with your use of Firebase services.";

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
 * Displays nodejs10 migration changelogs if the update contains a change to nodejs10 runtime.
 *
 * @param newSpec A extensionSpec to compare to
 * @param curSpec A current extensionSpec
 */
export function displayNodejsChangeNotice(
  newSpec: extensionsApi.ExtensionSpec,
  curSpec?: extensionsApi.ExtensionSpec
): void {
  if (shouldDisplayMsg(newSpec, curSpec)) {
    utils.logLabeledWarning(logPrefix, changeMsg);
  }
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
