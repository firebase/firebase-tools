import * as clc from "cli-color";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import TerminalRenderer from "marked-terminal";

import { Command } from "../command.js";
import { publishExtensionVersionFromLocalSource, logPrefix } from "../extensions/extensionsHelper.js";
import * as refs from "../extensions/refs.js";
import { findExtensionYaml } from "../extensions/localHelper.js";
import { consoleInstallLink } from "../extensions/publishHelpers.js";
import { requireAuth } from "../requireAuth.js";
import { FirebaseError } from "../error.js";
import * as utils from "../utils.js";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for publishing an extension version.
 */
export const command = new Command("ext:dev:publish <extensionRef>")
  .description(`publish a new version of an extension`)
  .withForce()
  .help(
    "if you have not previously published a version of this extension, this will " +
      "create the extension. If you have previously published a version of this extension, this version must " +
      "be greater than previous versions."
  )
  .before(requireAuth)
  .action(async (extensionRef: string, options: any) => {
    const { publisherId, extensionId, version } = refs.parse(extensionRef);
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
    const res = await publishExtensionVersionFromLocalSource({
      publisherId,
      extensionId,
      rootDirectory: extensionYamlDirectory,
      nonInteractive: options.nonInteractive,
      force: options.force,
    });
    if (res) {
      utils.logLabeledBullet(logPrefix, marked(`[Install Link](${consoleInstallLink(res.ref)})`));
    }
    return res;
  });
