import { FirebaseError } from "../error";
import * as extensionsApi from "./extensionsApi";
import { logPrefix } from "./extensionsHelper";
import { promptOnce } from "../prompt";
import * as utils from "../utils";

const changeMsg =
  "Node.js 8 has been deprecated. It’s recommended to update this extension to ensure it is running on Node.js 10.";
const billingMsg =
  "This update includes an upgrade to Node.js 10 from Node.js 8, which is no longer maintained. Your project must be on the Blaze (pay as you go) plan to deploy Node.js 10 functions. Starting with this update, you will be charged a small amount when you deploy this extension, including when you make configuration changes and apply future updates.";

function hasRuntime(resource: extensionsApi.Resource, runtime: string): boolean {
  let resourceRuntime = "nodejs8"; // default to nodejs8 runtime
  if (resource.properties && resource.properties.runtime) {
    resourceRuntime = resource.properties.runtime;
  }
  return resourceRuntime == runtime;
}

async function displayMessage(
  msg: string,
  newSpec: extensionsApi.ExtensionSpec,
  curSpec?: extensionsApi.ExtensionSpec
): Promise<void> {
  const newResources = newSpec.resources;
  const curResources = curSpec?.resources || [];
  if (
    newResources.some((r) => hasRuntime(r, "nodejs10")) &&
    (curSpec == undefined || curResources.some((r) => hasRuntime(r, "nodejs8")))
  ) {
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

/**
 * Displays nodejs10 migration changelogs if the update contains a change to nodejs10 runtime.
 *
 * @param curSpec A current extensionSpec
 * @param newSpec A extensionSpec to compare to
 * @return Displayed message
 */
export async function displayNodejsChangeNotice(
  newSpec: extensionsApi.ExtensionSpec,
  curSpec?: extensionsApi.ExtensionSpec
): Promise<void> {
  return displayMessage(changeMsg, newSpec, curSpec);
}

/**
 * Displays nodejs10 billing changes if the update contains a change to nodejs10 runtime.
 *
 * @param curSpec A current extensionSpec
 * @param newSpec A extensionSpec to compare to
 * @return Displayed message
 */
export async function displayNodejsBillingNotice(
  newSpec: extensionsApi.ExtensionSpec,
  curSpec?: extensionsApi.ExtensionSpec
): Promise<void> {
  return displayMessage(billingMsg, newSpec, curSpec);
}
