import { Command } from "../command";
import { logPrefix } from "../extensions/extensionsHelper";
import { unpublishExtension, getExtension } from "../extensions/extensionsApi";
import * as utils from "../utils";
import * as refs from "../extensions/refs";
import { promptOnce } from "../prompt";
import * as clc from "cli-color";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { checkMinRequiredVersion } from "../checkMinRequiredVersion";

module.exports = new Command("ext:dev:unpublish <extensionRef>")
  .description("unpublish an extension")
  .withForce()
  .help(
    "use this command to unpublish an extension, and make it unavailable for developers to install or reconfigure. " +
      "Specify the extension you want to unpublish using the format '<publisherId>/<extensionId>."
  )
  .before(requireAuth)
  .before(checkMinRequiredVersion, "extDevMinVersion")
  .action(async (extensionRef: string, options: any) => {
    const { publisherId, extensionId, version } = refs.parse(extensionRef);
    utils.logLabeledWarning(
      logPrefix,
      "If you unpublish this extension, developers won't be able to install it. For developers who currently have this extension installed, it will continue to run and will appear as unpublished when listed in the Firebase console or Firebase CLI."
    );
    utils.logLabeledWarning(
      "This is a permanent action",
      `Once unpublished, you may never use the extension name '${clc.bold(extensionId)}' again.`
    );
    if (version) {
      throw new FirebaseError(
        `Unpublishing a single version is not currently supported. You can only unpublish ${clc.bold(
          "ALL versions"
        )} of an extension. To unpublish all versions, please remove the version from the reference.`
      );
    }
    await getExtension(extensionRef);
    const consent = await comfirmUnpublish(publisherId, extensionId, options);
    if (!consent) {
      throw new FirebaseError("unpublishing cancelled.");
    }
    await unpublishExtension(extensionRef);
    utils.logLabeledSuccess(logPrefix, "successfully unpublished all versions of this extension.");
  });

async function comfirmUnpublish(
  publisherId: string,
  extensionId: string,
  options: any
): Promise<boolean> {
  if (options.nonInteractive && !options.force) {
    throw new FirebaseError("Pass the --force flag to use this command in non-interactive mode");
  }
  if (options.nonInteractive && options.force) {
    return true;
  }
  const message = `You are about to unpublish ALL versions of ${clc.green(
    `${publisherId}/${extensionId}`
  )}.\nDo you wish to continue? `;
  return promptOnce({
    type: "confirm",
    message,
    default: false, // Force users to explicitly type 'yes'
  });
}
