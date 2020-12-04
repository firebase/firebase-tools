import { Command } from "../command";
import { publishExtensionVersionFromLocalSource } from "../extensions/extensionsHelper";
import { parseRef } from "../extensions/extensionsApi";

import { findExtensionYaml } from "../extensions/localHelper";
import { requireAuth } from "../requireAuth";
import * as clc from "cli-color";
import { FirebaseError } from "../error";

/**
 * Command for publishing an extension version.
 */
export default new Command("ext:dev:publish <extensionRef>")
  .description(`publish a new version of an extension`)
  .help(
    "if you have not previously published a version of this extension, this will " +
      "create the extension. If you have previously published a version of this extension, this version must " +
      "be greater than previous versions."
  )
  .before(requireAuth)
  .action(async (extensionRef: string) => {
    const { publisherId, extensionId, version } = parseRef(extensionRef);
    if (version) {
      throw new FirebaseError(
        `The input extension reference must be of the format ${clc.bold(
          "<publisherId>/<extensionId>"
        )}. Version should not be supplied and will be inferred directly from extension.yaml. Please increment the version in extension.yaml if you would like to bump/specify a version.`
      );
    }
    if (!publisherId || !extensionId) {
      throw new FirebaseError(
        `Error parsing publisher ID and extension ID from extension reference '${clc.bold(
          extensionRef
        )}'. Please use the format '${clc.bold("<publisherId>/<extensionId>")}'.`
      );
    }
    const extensionYamlDirectory = findExtensionYaml(process.cwd());
    const res = await publishExtensionVersionFromLocalSource(
      publisherId,
      extensionId,
      extensionYamlDirectory
    );
    return res;
  });
