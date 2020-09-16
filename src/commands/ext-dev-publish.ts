import { Command } from "../command";
import * as logger from "../logger";
import { publishExtensionVersionFromLocalSource } from "../extensions/extensionsHelper";
import { findExtensionYaml } from "../extensions/localHelper";
import { requireAuth } from "../requireAuth";

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
      logger.info(
        `Error parsing publisher ID and extension ID from ${extensionRef}. Please use the format '<publisher-id>/<extension-id>'.`
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
