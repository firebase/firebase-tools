import * as clc from "cli-color";
import * as _ from "lodash";

import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import * as extensionsApi from "../extensions/extensionsApi";
import { ensureExtensionsApiEnabled, logPrefix } from "../extensions/extensionsHelper";
import { isLocalExtension, getLocalExtensionSpec } from "../extensions/localHelper";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import TerminalRenderer = require("marked-terminal");

const FUNCTION_TYPE_REGEX = /\..+\.function/;

export default new Command("ext:info <extensionName>")
  .description(
    "display information about an extension by name (extensionName@x.y.z for a specific version)"
  )
  .option("--markdown", "output info in Markdown suitable for constructing a README file")
  .before(checkMinRequiredVersion, "extMinVersion")
  .action(async (extensionName: string, options: any) => {
    let spec;
    if (isLocalExtension(extensionName)) {
      if (!options.markdown) {
        utils.logLabeledBullet(logPrefix, `reading extension from directory: ${extensionName}`);
      }
      spec = await getLocalExtensionSpec(extensionName);
    } else {
      await requirePermissions(options, ["firebaseextensions.sources.get"]);
      await ensureExtensionsApiEnabled(options);
      const hasPublisherId = extensionName.split("/").length >= 2;
      if (hasPublisherId) {
        const nameAndVersion = extensionName.split("/")[1];
        if (nameAndVersion.split("@").length < 2) {
          extensionName = extensionName + "@latest";
        }
      } else {
        const [name, version] = extensionName.split("@");
        extensionName = `firebase/${name}@${version || "latest"}`;
      }
      const version = await extensionsApi.getExtensionVersion(extensionName);
      spec = version.spec;
    }

    if (!options.markdown) {
      utils.logLabeledBullet(logPrefix, `information about ${extensionName}:\n`);
    }

    const lines: string[] = [];
    if (options.markdown) {
      lines.push(`# ${spec.displayName}`);
    } else {
      lines.push(`**Name**: ${spec.displayName}`);
    }

    const authorName = spec.author?.authorName;
    const url = spec.author?.url;
    const urlMarkdown = url ? `(**[${url}](${url})**)` : "";
    lines.push(`**Author**: ${authorName} ${urlMarkdown}`);

    if (spec.description) {
      lines.push(`**Description**: ${spec.description}`);
    }
    if (spec.preinstallContent) {
      lines.push("", `**Details**: ${spec.preinstallContent}`);
    }

    if (spec.params && Array.isArray(spec.params) && spec.params.length > 0) {
      lines.push("", "**Configuration Parameters:**");
      _.forEach(spec.params, (param) => {
        lines.push(`* ${param.label}` + (param.description ? `: ${param.description}` : ""));
      });
    }

    const functions: any = [];
    const otherResources: any = [];
    _.forEach(spec.resources, (resource) => {
      if (FUNCTION_TYPE_REGEX.test(resource.type)) {
        functions.push(resource);
      } else {
        otherResources.push(resource);
      }
    });

    if (functions.length > 0) {
      lines.push("", "**Cloud Functions:**");
      _.forEach(functions, (func) => {
        lines.push(`* **${func.name}:** ${func.description}`);
      });
    }
    if (otherResources.length > 0) {
      lines.push("", "**Other Resources**:");
      _.forEach(otherResources, (resource) => {
        lines.push(`* ${resource.name} (${resource.type})`);
      });
    }
    if (spec.apis) {
      lines.push("", "**APIs Used**:");
      _.forEach(spec.apis, (api) => {
        lines.push(`* ${api.apiName}` + (api.reason ? ` (Reason: ${api.reason})` : ""));
      });
    }
    if (spec.roles) {
      lines.push("", "**Access Required**:");
      lines.push("", "This extension will operate with the following project IAM roles:");
      _.forEach(spec.roles, (role) => {
        lines.push(`* ${role.role}` + (role.reason ? ` (Reason: ${role.reason})` : ""));
      });
    }

    if (options.markdown) {
      // Github requires 2 newline characters in README.md to render a line break.
      logger.info(lines.join("\n\n"));
    } else {
      marked.setOptions({
        renderer: new TerminalRenderer(),
      });
      logger.info(marked(lines.join("\n")));
      utils.logLabeledBullet(
        logPrefix,
        `to install this extension, type ` +
          clc.bold(`firebase ext:install ${extensionName} --project=YOUR_PROJECT`)
      );
    }
  });
