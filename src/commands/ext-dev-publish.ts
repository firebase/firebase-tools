import * as clc from "colorette";
import { marked } from "marked";
import * as TerminalRenderer from "marked-terminal";

import { Command } from "../command";
import { publishExtensionVersionFromLocalSource, logPrefix } from "../extensions/extensionsHelper";
import * as refs from "../extensions/refs";
import { findExtensionYaml } from "../extensions/localHelper";
import { consoleInstallLink } from "../extensions/publishHelpers";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import * as utils from "../utils";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for publishing an extension version.
 */
export const command = new Command("ext:dev:publish <extensionRef>")
  .description(`publish a new version of an extension`)
  .option(`-s, --stage <stage>`, `release stage (supports "rc", "alpha", "beta", and "stable")`)
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
      stage: options.stage ?? "stable",
    });
    if (res) {
      utils.logLabeledBullet(logPrefix, marked(`[Install Link](${consoleInstallLink(res.ref)})`));
    }
    return res;
  });
