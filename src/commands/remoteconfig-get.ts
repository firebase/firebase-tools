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

const limit = 50;

//Function retrieves names for parameter and parameter group
function getItems(command: any) {
  var updatedArray = '';
  let counter = 0;
  for(let item in command){
    updatedArray = updatedArray.concat(item, '\n');
    counter++
    if (counter === limit){
      updatedArray += "+more..." + '\n';
      break
    }
  }
  return updatedArray;
  }

module.exports = new Command("remoteconfig:get")
  .description("Get Firebase projects you have access to")
  .option("--template_version <version_number>", "grabs the specified version of the template")
  .option("-o, --output", "save the output to the default file path")
  .before(requireAuth)
  .action(
    async (options) => {
      
    //firebase remoteconfig:get implementation
    const template = await rcGet.getTemplate(getProjectId(options), options.template_version);
    
    const table = new Table({ head: tableHead, style: { head: ["green"] } });

    var updatedConditions = '';
    let counter = 0;
    for(let item in template.conditions){
      updatedConditions += template.conditions[item].name + '\n';
      counter++
      if (counter === limit){
        updatedConditions += "+more..." + '\n';
        break
      }
    }
    table.push(["conditions", updatedConditions])
  
    const updatedParameters = getItems(template.parameters);
    table.push(["parameters",updatedParameters])

    const updatedParameterGroups = getItems(template.parameterGroups);
    table.push(["parameterGroups", updatedParameterGroups])
    
    table.push(["version", util.inspect(template.version, {showHidden: false, depth: null})])

    //firebase remoteconfig:get --output implementation
    var fileOut = !!options.output;
    if(fileOut){
      var outStream= fs.createWriteStream(options.config.get("remoteconfig.template"));
      outStream.write(util.inspect(template, {showHidden: false, depth: null}));
    }
    else{
      logger.info(table.toString());
    }
  }
  )

 

