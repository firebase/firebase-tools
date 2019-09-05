import * as clc from "cli-color";
import * as _ from "lodash";

import * as Command from "../command";
import { resolveSource } from "../extensions/resolveSource";
import * as modsApi from "../extensions/modsApi";
import { ensureModsApiEnabled, logPrefix } from "../extensions/modsHelper";
import * as logger from "../logger";
import * as requirePermissions from "../requirePermissions";
import * as utils from "../utils";

import * as marked from "marked";
import TerminalRenderer = require("marked-terminal");

const FUNCTION_TYPE_REGEX = /firebasemods\..+\.function/;

export default new Command("ext:info <extensionName>")
  .description(
    "display information about an extension by name (extensionName@x.y.z for a specific version)"
  )
  .option("--markdown", "output info in Markdown suitable for constructing a README file")
  .before(requirePermissions, [
    // this doesn't exist yet, uncomment when it does
    // "firebasemods.sources.get"
  ])
  .before(ensureModsApiEnabled)
  .action(async (modName: string, options: any) => {
    const sourceUrl = await resolveSource(modName);
    const source = await modsApi.getSource(sourceUrl);
    const spec = source.spec;
    if (!options.markdown) {
      utils.logLabeledBullet(logPrefix, `information about ${modName}:\n`);
    }

    const lines: string[] = [];
    if (options.markdown) {
      lines.push(`# ${spec.displayName}`);
    } else {
      lines.push(`**Name**: ${spec.displayName}`);
    }

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
          clc.bold(`firebase ext:install ${modName} --project=YOUR_PROJECT`)
      );
    }
  });
