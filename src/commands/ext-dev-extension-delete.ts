import * as utils from "../utils";
import * as clc from "cli-color";

import { Command } from "../command";
import { logPrefix } from "../extensions/extensionsHelper";
import { getExtension, deleteExtension } from "../extensions/extensionsApi";
import * as refs from "../extensions/refs";
import { promptOnce } from "../prompt";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { checkMinRequiredVersion } from "../checkMinRequiredVersion";

module.exports = new Command("ext:dev:delete <extensionRef>")
  .description("delete an extension")
  .help(
    "use this command to delete an extension, and make it unavailable for developers to install or reconfigure. " +
      "Specify the extension you want to delete using the format '<publisherId>/<extensionId>."
  )
  .before(requireAuth)
  .before(checkMinRequiredVersion, "extDevMinVersion")
  .action(async (extensionRef: string) => {
    const { publisherId, extensionId, version } = refs.parse(extensionRef);
    if (version) {
      throw new FirebaseError(
        `Deleting a single version is not currently supported. You can only delete ${clc.bold(
          "ALL versions"
        )} of an extension. To delete all versions, please remove the version from the reference.`
      );
    }
    utils.logLabeledWarning(
      logPrefix,
      "If you delete this extension, developers won't be able to install it. " +
        "For developers who currently have this extension installed, " +
        "it will continue to run and will appear as unpublished when " +
        "listed in the Firebase console or Firebase CLI."
    );
    utils.logLabeledWarning(
      "This is a permanent action",
      `Once deleted, you may never use the extension name '${clc.bold(extensionId)}' again.`
    );
    await getExtension(extensionRef);
    const consent = await confirmDelete(publisherId, extensionId);
    if (!consent) {
      throw new FirebaseError("deletion cancelled.");
    }
    await deleteExtension(extensionRef);
    utils.logLabeledSuccess(logPrefix, "successfully deleted all versions of this extension.");
  });

async function confirmDelete(publisherId: string, extensionId: string): Promise<boolean> {
  const message = `You are about to delete ALL versions of ${clc.green(
    `${publisherId}/${extensionId}`
  )}.\nDo you wish to continue? `;
  return promptOnce({
    type: "confirm",
    message,
    default: false, // Force users to explicitly type 'yes'
  });
}
