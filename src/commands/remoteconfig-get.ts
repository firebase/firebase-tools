import * as rcGet from "../remoteconfig/get";
import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import Table = require("cli-table");
import * as logger from "../logger";
import * as fs from "fs";
var getProjectId = require("../getProjectId");

const util = require('util');
const tableHead = [
  "Entry Name", "Value"
];

 function getItems(command: any) {
    var updatedArray = '';
  for(let item in command){
    updatedArray = updatedArray.concat(item, '\n');
  }
  return updatedArray;
  }

module.exports = new Command("remoteconfig:get")
  .description("Get Firebase projects you have access to")
  .option("--template_version <version_number>", "grabs the specified version of the template")
  .option("-o, --output <file path>", "save the output to the default file path")
  .before(requireAuth)
  .action(
    async (options) => {
    
    const template = await rcGet.getTemplate(getProjectId(options), options.template_version);
    
    const table = new Table({ head: tableHead, style: { head: ["green"] } });

    //const updatedConditions = [];
    var updatedConditions = '';
    for(let item in template.conditions){
      //updatedConditions.push(template.conditions[item].name);
      updatedConditions += template.conditions[item].name + '\n';
      }
    table.push(["conditions", updatedConditions])
    //table.push(["conditions", util.inspect(updatedConditions, {showHidden: false, depth: null})])
  
    const updatedParameters = getItems(template.parameters);
    table.push(["parameters",updatedParameters])

    const updatedParameterGroups = getItems(template.parameterGroups);
    table.push(["parameterGroups", updatedParameterGroups])
    
    table.push(["version", util.inspect(template.version, {showHidden: false, depth: null})])

    var fileOut = !!options.output;
    if(fileOut){
      var outStream= fs.createWriteStream(options.output);
      outStream.write(table.toString());
    }
    else{
      logger.info(table.toString());
    }
  }
  )

 

