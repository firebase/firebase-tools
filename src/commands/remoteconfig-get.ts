import * as rcGet from "../remoteconfig/get";
import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import * as logger from "../logger";
import { RemoteConfigTemplate } from "../remoteconfig/interfaces";
import getProjectId = require("../getProjectId");
import { requirePermissions } from "../requirePermissions";

import Table = require("cli-table");
import * as fs from "fs";
import util = require("util");

const tableHead = ["Entry Name", "Value"];

// Creates a maximum limit of 50 names for each entry
const MAX_DISPLAY_ITEMS = 50;

/**
 * Function retrieves names for parameters and parameter groups
 * @param templateItems Input is template.parameters or template.parameterGroups
 * @return {string} Parses the template and returns a formatted string that concatenates items and limits the number of items outputted that is used in the table
 */
export function parseTemplateForTable(
  templateItems: RemoteConfigTemplate["parameters"] | RemoteConfigTemplate["parameterGroups"]
): string {
  let outputStr = "";
  let counter = 0;
  for (const item in templateItems) {
    if (Object.prototype.hasOwnProperty.call(templateItems, item)) {
      outputStr = outputStr.concat(item, "\n");
      counter++;
      if (counter === MAX_DISPLAY_ITEMS) {
        outputStr += "+more..." + "\n";
        break;
      }
    }
  }
  return outputStr;
}

function checkValidNumber(versionNumber: string): string {
  if (typeof Number(versionNumber) == "number") {
    return versionNumber;
  }
  return "null";
}

module.exports = new Command("remoteconfig:get")
  .description("Get a Firebase project's Remote Config template")
  .option("-v, --v <versionNumber>", "grabs the specified version of the template")
  .option(
    "-o, --output [filename]",
    "write config output to a filename (if omitted, will use the default file path)"
  )
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfig.configs.get"])
  .action(async (options) => {
    const template: RemoteConfigTemplate = await rcGet.getTemplate(
      getProjectId(options),
      checkValidNumber(options.v)
    );
    const table = new Table({ head: tableHead, style: { head: ["green"] } });
    if (template.conditions) {
      let updatedConditions = template.conditions
        .map((condition) => condition.name)
        .slice(0, MAX_DISPLAY_ITEMS)
        .join("\n");
      if (template.conditions.length > MAX_DISPLAY_ITEMS) {
        updatedConditions += "+more... \n";
      }
      table.push(["conditions", updatedConditions]);
    }
    const updatedParameters = parseTemplateForTable(template.parameters);
    table.push(["parameters", updatedParameters]);

    const updatedParameterGroups = parseTemplateForTable(template.parameterGroups);
    table.push(["parameterGroups", updatedParameterGroups]);
    table.push(["version", util.inspect(template.version, { showHidden: false, depth: null })]);

    // Firebase remoteconfig:get --output implementation
    const fileOut = !!options.output;
    if (fileOut) {
      const shouldUseDefaultFilename = options.output === true || options.output === "";
      const filename = shouldUseDefaultFilename
        ? options.config.get("remoteconfig.template")
        : options.output;
      fs.writeFileSync(filename, JSON.stringify(template, null, 2));
    } else {
      logger.info(table.toString());
    }
    return template;
  });
