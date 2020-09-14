import { ExtensionSpec } from "./extensionsApi";
import * as utils from "../utils";
import { logPrefix } from "./extensionsHelper";
import * as logger from "../logger";
import * as marked from "marked";
import { FirebaseError } from "../error";

/**
 *  displayExtInstallInfo prints the extension info displayed when running ext:install.
 */
export function displayExtInstallInfo(extensionName: string, spec: ExtensionSpec): void {
  const lines = [];
  lines.push(`**Name**: ${spec.displayName}`);
  const url = spec.author?.url;
  const urlMarkdown = url ? `(**[${url}](${url})**)` : "";
  lines.push(`**Author**: ${spec.author?.authorName} ${urlMarkdown}`);
  if (spec.description) {
    lines.push(`**Description**: ${spec.description}`);
  }
  if (lines.length > 0) {
    utils.logLabeledBullet(logPrefix, `information about ${extensionName}:`);
    const infoStr = lines.join("\n");
    // Convert to markdown and convert any trailing newlines to a single newline.
    const formatted = marked(infoStr).replace(/\n+$/, "\n");
    logger.info(formatted);
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
