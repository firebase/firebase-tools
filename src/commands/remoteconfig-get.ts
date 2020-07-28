import * as rcGet from "../remoteconfig/get";
import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import Table = require("cli-table");
import * as logger from "../logger";
import * as fs from "fs";
import getProjectId = require("../getProjectId");
import util = require("util");
import { RemoteConfigTemplate } from "../remoteconfig/interfaces";

const tableHead = ["Entry Name", "Value"];

// Creates a maximum limit of 50 names for each entry
const limit = 50;

/**
 * Function retrieves names for parameters and parameter groups
 * @param templateItems Input is template.parameters or template.parameterGroups
 * @return {string} Returns string that concatenates items and limits the number of items outputted
 */
function getItems(
  templateItems: RemoteConfigTemplate["parameters"] | RemoteConfigTemplate["parameterGroups"]
): string {
  let outputStr = "";
  let counter = 0;
  for (const item in templateItems) {
    if (Object.prototype.hasOwnProperty.call(templateItems, item)) {
      outputStr = outputStr.concat(item, "\n");
      counter++;
      if (counter === limit) {
        outputStr += "+more..." + "\n";
        break;
      }
    }
  }
  return outputStr;
}

module.exports = new Command("remoteconfig:get")
  .description("Get a Firebase project's Remote Config template")
  .option("-v, --v <version_number>", "grabs the specified version of the template")
  .option("-o, --output [filename]", "save the output to the default file path")
  .before(requireAuth)
  .action(async (options) => {
    // Firebase remoteconfig:get implementation
    const template: RemoteConfigTemplate = await rcGet.getTemplate(
      getProjectId(options),
      options.v
    );
    const table = new Table({ head: tableHead, style: { head: ["green"] } });
    if (template.conditions) {
      let updatedConditions = template.conditions
        .map((condition) => condition.name)
        .slice(0, limit)
        .join("\n");
      if (template.conditions.length > limit) {
        updatedConditions += "+more... \n";
      }
      table.push(["conditions", updatedConditions]);
    }
    const updatedParameters = getItems(template.parameters);
    table.push(["parameters", updatedParameters]);

    const updatedParameterGroups = getItems(template.parameterGroups);
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
      //const outStream = fs.createWriteStream(filename);
      //outStream.write(util.inspect(template, { showHidden: false, depth: null }));
    } else {
      logger.info(table.toString());
    }
  });
