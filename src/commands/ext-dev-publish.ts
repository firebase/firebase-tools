import { marked } from "marked";
import * as TerminalRenderer from "marked-terminal";

import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import { uploadExtensionAction, UploadExtensionOptions } from "./ext-dev-upload";
import { logLabeledWarning } from "../utils";
import { ensureExtensionsPublisherApiEnabled } from "../extensions/extensionsHelper";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for publishing an extension version.
 */
export const command = new Command("ext:dev:publish <extensionRef>")
  .description(`Deprecated. Use ext:dev:upload instead`)
  .option(`-s, --stage <stage>`, `release stage (supports "alpha", "beta", "rc", and "stable")`)
  .option(`--repo <repo>`, `Public GitHub repo URI that contains the extension source`)
  .option(`--ref <ref>`, `commit hash, branch, or tag to build from the repo (defaults to HEAD)`)
  .option(
    `--root <root>`,
    `root directory that contains this extension (defaults to last uploaded root or "/" if none set)`
  )
  .withForce()
  .help(
    "if you have not previously uploaded a version of this extension, this will " +
      "create the extension. If you have previously uploaded a version of this extension, this version must " +
      "be greater than previous versions."
  )
  .before(requireAuth)
  .before(ensureExtensionsPublisherApiEnabled)
  .action(async (extensionRef: string, options: UploadExtensionOptions) => {
    logLabeledWarning(
      "Extensions",
      "ext:dev:publish has been deprecated and will be removed in the future. Please use ext:dev:upload instead."
    );
    if (!options.repo && !options.ref && !options.root) {
      options.local = true;
    }
    return uploadExtensionAction(extensionRef, options);
  });
