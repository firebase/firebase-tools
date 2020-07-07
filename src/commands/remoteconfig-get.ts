import * as rcGet from "../remoteconfig/get";
import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import Table = require("cli-table");
import * as logger from "../logger";
var getProjectId = require("../getProjectId");

const util = require('util');
const tableHead = [
  "Entry Name", "Value"
];

/**Function below helps create new array of values to be pushed into the table */
function getItems(command: any) {
  const updatedArray = [];
  for(let item in command){
    updatedArray.push(item);
  }
  return updatedArray;
}

module.exports = new Command("remoteconfig:get")
  .description("Get Firebase projects you have access to")
  .option("--template_version <version_number>", "grabs the specified version of the template")
  .before(requireAuth)
  .action(
    async (options) => {
    
    const template = await rcGet.getTemplate(getProjectId(options), options.template_version);
    
    const table = new Table({ head: tableHead, style: { head: ["green"] } });

    const updatedConditions = [];
    for(let item in template.conditions){
      updatedConditions.push(template.conditions[item].name);
      }
    table.push(["conditions", util.inspect(updatedConditions, {showHidden: false, depth: null})])
  
    const updatedParameters = getItems(template.parameters);
    table.push(["parameters", util.inspect(updatedParameters, {showHidden: false, depth: null})])

    const updatedParameterGroups = getItems(template.parameterGroups);
    table.push(["parameterGroups", util.inspect(updatedParameterGroups, {showHidden: false, depth: null})])
    table.push(["version", util.inspect(template.version, {showHidden: false, depth: null})])
    logger.info(table.toString());
  }
  )

 

