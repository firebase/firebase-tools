/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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

export const command = new Command("ext:dev:delete <extensionRef>")
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
