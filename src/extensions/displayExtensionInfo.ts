import * as clc from "colorette";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import TerminalRenderer = require("marked-terminal");

import * as utils from "../utils";
import { logPrefix } from "./extensionsHelper";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { ExtensionSpec } from "./types";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * displayExtInfo prints the extension info displayed when running ext:install.
 *
 * @param extensionName name of the extension to display information about
 * @param spec extension spec
 * @param published whether or not the extension is a published extension
 */
export function displayExtInfo(
  extensionName: string,
  publisher: string,
  spec: ExtensionSpec,
  published = false
): string[] {
  const lines = [];
  lines.push(`**Name**: ${spec.displayName}`);
  if (publisher) {
    lines.push(`**Publisher**: ${publisher}`);
  }
  if (spec.description) {
    lines.push(`**Description**: ${spec.description}`);
  }
  if (published) {
    if (spec.license) {
      lines.push(`**License**: ${spec.license}`);
    }
    lines.push(`**Source code**: ${spec.sourceUrl}`);
  }
  if (lines.length > 0) {
    utils.logLabeledBullet(logPrefix, `information about '${clc.bold(extensionName)}':`);
    const infoStr = lines.join("\n");
    // Convert to markdown and convert any trailing newlines to a single newline.
    const formatted = marked(infoStr).replace(/\n+$/, "\n");
    logger.info(formatted);
    // Return for testing purposes.
    return lines;
  } else {
    throw new FirebaseError(
      "Error occurred during installation: cannot parse info from source spec",
      {
        context: {
          spec: spec,
          extensionName: extensionName,
        },
      }
    );
  }
}

/**
 * Prints a clickable link where users can download the source code for an Extension Version.
 */
export function printSourceDownloadLink(sourceDownloadUri: string): void {
  const sourceDownloadMsg = `Want to review the source code that will be installed? Download it here: ${sourceDownloadUri}`;
  utils.logBullet(marked(sourceDownloadMsg));
}
