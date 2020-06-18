import { ExtensionSource } from "./extensionsApi";
import * as utils from "../utils";
import { logPrefix } from "./extensionsHelper";
import * as logger from "../logger";
import * as marked from "marked";
import { FirebaseError } from "../error";

// displayExtInstallInfo prints the truncated extension info.
// This UI is displayed when the consumer installs extension.
export function displayExtInstallInfo(extensionName: string, source: ExtensionSource) {
  let lines = [];
  lines.push(`**Name**: ${source.spec.displayName}`);
  if (source.spec.author && source.spec.author.authorName) {
    lines.push(`**Author**: ${source.spec.author.authorName}`);
  }
  if (source.spec.description) {
    lines.push(`**Description**: ${source.spec.description}`);
  }
  if (lines.length > 0) {
    utils.logLabeledBullet(logPrefix, `information about ${extensionName}:`);
    logger.info(marked(lines.join("\n")));
  } else {
    throw new FirebaseError(
      "Error occurred during installation: cannot parse info from source spec",
      {
        context: {
          source: source,
          extensionName: extensionName,
        },
      }
    );
  }
}
