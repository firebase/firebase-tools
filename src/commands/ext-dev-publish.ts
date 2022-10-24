import * as clc from "colorette";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import TerminalRenderer = require("marked-terminal");

import { Command } from "../command";
import {
  publishExtensionVersionFromLocalSource,
  logPrefix,
  publishExtensionVersionFromRemoteRepo,
} from "../extensions/extensionsHelper";
import * as refs from "../extensions/refs";
import { findExtensionYaml } from "../extensions/localHelper";
import { consoleInstallLink } from "../extensions/publishHelpers";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import * as utils from "../utils";
import { logger } from "..";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for publishing an extension version.
 */
export const command = new Command("ext:dev:publish <extensionRef>")
  .description(`publish a new version of an extension`)
  .option(`-s, --stage <stage>`, `release stage (supports "rc", "alpha", "beta", and "stable")`)
  .option(`--repo <repo>`, `Public Git repo URI (only required for first version)`)
  .option(
    `-r, --ref <ref>`,
    `commit hash, branch, or tag to build from the repo (defaults to HEAD)`
  )
  .option(
    `--root <root>`,
    `root directory that contains this Extension (defaults to previous version's root or root of repo if none set)`
  )
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
    let res;
    // TODO: Default to this path instead of local source in a major version.
    if (options.ref) {
      res = await publishExtensionVersionFromRemoteRepo({
        publisherId,
        extensionId,
        repoUri: options.repo,
        sourceRef: options.ref,
        extensionRoot: options.root,
        nonInteractive: options.nonInteractive,
        force: options.force,
        stage: options.stage ?? "rc",
      });
    } else {
      const extensionYamlDirectory = findExtensionYaml(process.cwd());
      res = await publishExtensionVersionFromLocalSource({
        publisherId,
        extensionId,
        rootDirectory: extensionYamlDirectory,
        nonInteractive: options.nonInteractive,
        force: options.force,
        stage: options.stage ?? "stable",
      });
    }
    if (res) {
      utils.logLabeledBullet(logPrefix, marked(`[Install Link](${consoleInstallLink(res.ref)})`));
    }
    return res;
  });
