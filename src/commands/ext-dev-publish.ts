import { Command } from "../command";
import { publishExtensionVersionFromLocalSource } from "../extensions/extensionsHelper";
import { findExtensionYaml } from "../extensions/localHelper";
import { requireAuth } from "../requireAuth";
import * as clc from "cli-color";
import { FirebaseError } from "../error";

/**
 * Command for publishing an extension version.
 */
export default new Command("ext:dev:publish <publisherId>/<extensionId>")
  .description(`publish a new version of an extension`)
  .help(
    "if you have not previously published a version of this extension, this will " +
      "create the extension. If you have previously published a version of this extension, this version must " +
      "be greater than previous versions."
  )
  .before(requireAuth)
  .action(async (extensionRef: string, options: any) => {
    const [publisherId, extensionId] = extensionRef.split("/");
    if (!publisherId || !extensionId) {
      throw new FirebaseError(
        `Error parsing publisher ID and extension ID from extension reference '${clc.bold(
          extensionRef
        )}'. Please use the format '${clc.bold("<publisher-id>/<extension-id>")}'.`
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
