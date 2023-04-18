import { marked } from "marked";
import * as TerminalRenderer from "marked-terminal";

import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import { uploadExtensionAction } from "./ext-dev-upload";
import { logLabeledWarning } from "../utils";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for publishing an extension version.
 */
export const command = new Command("ext:dev:publish <extensionRef>")
  .description(`Deprecated. Use ext:dev:upload instead`)
  .option(`-s, --stage <stage>`, `release stage (supports "alpha", "beta", "rc", and "stable")`)
  .option(
    `--repo <repo>`,
    `Public Git repo URI (only required for first version from repo, cannot be changed)`
  )
  .option(`--ref <ref>`, `commit hash, branch, or tag to build from the repo (defaults to HEAD)`)
  .option(
    `--root <root>`,
    `root directory that contains this Extension (defaults to previous version's root or root of repo if none set)`
  )
  .withForce()
  .help(
    "if you have not previously uploaded a version of this extension, this will " +
      "create the extension. If you have previously uploaded a version of this extension, this version must " +
      "be greater than previous versions."
  )
  .before(requireAuth)
  .action(async (extensionRef: string, options: any) => {
    logLabeledWarning(
      "Extensions",
      "ext:dev:publish has been deprecated and will be removed in the future. Please use ext:dev:upload instead."
    );
    return uploadExtensionAction(extensionRef, options);
  });
