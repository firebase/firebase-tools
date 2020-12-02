import { Command } from "../command";
import { logPrefix } from "../extensions/extensionsHelper";
import { unpublishExtension, parseRef, getExtension } from "../extensions/extensionsApi";
import * as utils from "../utils";
import { promptOnce } from "../prompt";
import * as clc from "cli-color";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";

module.exports = new Command("ext:dev:unpublish <extensionRef>")
  .description("unpublish an extension")
  .help(
    "use this command to unpublish an extension, and make it unavailable for developers to install or reconfigure. " +
      "Specify the extension you want to unpublish using the format '<publisherId>/<extensionId>."
  )
  .before(requireAuth)
  .action(async (extensionRef: string) => {
    const { publisherId, extensionId, version } = parseRef(extensionRef);
    const message =
      "If you unpublish this extension, developers won't be able to install it. For developers who currently have this extension installed, it will continue to run and will appear as unpublished when listed in the Firebase console or Firebase CLI.";
    utils.logLabeledWarning(logPrefix, message);
    if (version) {
      throw new FirebaseError(
        `Unpublishing a single version is not currently supported. You can only unpublish ${clc.bold(
          "ALL versions"
        )} of an extension. To unpublish all versions, please remove the version from the reference.`
      );
    }
    await getExtension(extensionRef);
    const consent = await comfirmUnpublish(publisherId, extensionId);
    if (!consent) {
      throw new FirebaseError("unpublishing cancelled.");
    }
    await unpublishExtension(extensionRef);
    utils.logLabeledSuccess(logPrefix, "successfully unpublished all versions of this extension.");
  });

async function comfirmUnpublish(publisherId: string, extensionId: string): Promise<string> {
  const message = `You are about to unpublish ALL versions of ${clc.green(
    `${publisherId}/${extensionId}`
  )}.\nDo you wish to continue? `;
  return await promptOnce({
    type: "confirm",
    message,
    default: false, // Force users to explicitly type 'yes'
  });
}
