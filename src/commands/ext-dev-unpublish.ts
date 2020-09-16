import { Command } from "../command";
import { logPrefix } from "../extensions/extensionsHelper";
import { unpublishExtension, parseRef } from "../extensions/extensionsApi";
import * as utils from "../utils";
import { promptOnce } from "../prompt";
import { FirebaseError } from "../error";
import * as clc from "cli-color";
import { requireAuth } from "../requireAuth";

module.exports = new Command("ext:dev:unpublish [ref]")
  .description("unpublish an extension")
  .help(
    "use this command to unpublish an extension, and make it unavailable for developers to install or reconfigure. " +
      "Specify the extension you want to unpublish using the format '<publisherId/extensionId>'."
  )
  .before(requireAuth)
  .action(async (ref: string, options: any) => {
    const { publisherId, extensionId, version } = parseRef(ref);
    let message =
      "If you unpublish this extension, developers won't be able to install it, and developers who have already installed this extension won't be able to reconfigure it.";
    utils.logLabeledWarning(logPrefix, message);
    if (version) {
      return utils.reject(
        "Unpublishing a specific version is not currently supported. This command will unpublish all versions of this extension. If you would like to proceed, please remove the version from the reference and try the command again.",
        { exit: 1 }
      );
    }
    const consent = await comfirmUnpublish(publisherId, extensionId);
    if (!consent) {
      return utils.reject("Unpublishing cancelled.", { exit: 1 });
    }
    try {
      await unpublishExtension(ref);
      utils.logLabeledSuccess(
        logPrefix,
        "successfully unpublished all versions of this extension!"
      );
    } catch (err) {
      if (err instanceof FirebaseError) {
        throw err;
      }

      throw new FirebaseError(`Error occurred unpublishing ${ref}: ${err}`);
    }
  });

export async function comfirmUnpublish(publisherId: string, extensionId: string): Promise<string> {
  let message = `You are about to unpublish ALL versions of ${clc.green(
    `${publisherId}/${extensionId}`
  )}.\nDo you wish to continue?\n`;
  return await promptOnce({
    type: "confirm",
    message,
    default: false, // Force users to explicitly type 'yes'
  });
}
