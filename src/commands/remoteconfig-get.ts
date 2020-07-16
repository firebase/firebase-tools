import * as rcGet from "../remoteconfig/get";
import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import Table = require("cli-table");
import * as logger from "../logger";
import * as fs from "fs";

let getProjectId = require("../getProjectId");

const util = require("util");
const tableHead = ["Entry Name", "Value"];

const limit = 50;

// Function retrieves names for parameter and parameter group
function getItems(command: any) {
  let updatedArray = "";
  let counter = 0;
  for (let item in command) {
    if (command.hasOwnProperty(item)) {
      updatedArray = updatedArray.concat(item, "\n");
      counter++;
      if (counter === limit) {
        updatedArray += "+more..." + "\n";
        break;
      }
    }
  }
  return updatedArray;
}

module.exports = new Command("remoteconfig:get")
  .description("Get Firebase project you have access to")
  .option("--v <version_number>", "grabs the specified version of the template")
  .option("-o, --output", "save the output to the default file path")
  .before(requireAuth)
  .action(async (options) => {
    // Firebase remoteconfig:get implementation
    const template = await rcGet.getTemplate(getProjectId(options), options.v);
    const table = new Table({ head: tableHead, style: { head: ["green"] } });

    let updatedConditions = "";
    let counter = 0;
    for (let item in template.conditions) {
      if (template.conditions.hasOwnProperty(item)) {
        updatedConditions += template.conditions[item].name + "\n";
        counter++;
        if (counter === limit) {
          updatedConditions += "+more..." + "\n";
          break;
        }
      }
    }
    table.push(["conditions", updatedConditions]);
    const updatedParameters = getItems(template.parameters);
    table.push(["parameters", updatedParameters]);

    const updatedParameterGroups = getItems(template.parameterGroups);
    table.push(["parameterGroups", updatedParameterGroups]);
    table.push(["version", util.inspect(template.version, { showHidden: false, depth: null })]);

    // Firebase remoteconfig:get --output implementation
    let fileOut = !!options.output;
    if (fileOut) {
      let outStream = fs.createWriteStream(options.config.get("remoteconfig.template"));
      outStream.write(util.inspect(template, { showHidden: false, depth: null }));
    } else {
      logger.info(table.toString());
    }
  });
