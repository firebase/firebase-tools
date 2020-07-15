import * as rcVersion from "../remoteconfig/versionslist";
import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import Table = require("cli-table");
import * as logger from "../logger";

var getProjectId = require("../getProjectId");
const util = require('util');
const tableHead = [
    "UpdateUser", "Version Number", "Update Time"
];

module.exports = new Command("remoteconfig:versions:list")
    .description("Gets versions list for default active Firebase project")
    .option("--limit <number>", "returns number of versions based on specified number")
    .before(requireAuth)
    .action(
        async (options) => {
            const template = await rcVersion.getVersions(getProjectId(options));
            const table = new Table({ head: tableHead, style: { head: ["green"] } });
            var printLimit = !!options.limit;
            if(printLimit){
                if(options.limit == 0){
                    for(let item in template.versions){
                        table.push([template.versions[item].updateUser.email, template.versions[item].versionNumber, template.versions[item].updateTime]);
                    }
                } else{
                    for(let item in template.versions.slice(0,options.limit)){
                        table.push([template.versions[item].updateUser.email, template.versions[item].versionNumber, template.versions[item].updateTime]);
                    }
                }
            } else{
                for(let item in template.versions.slice(0,10)){
                    table.push([template.versions[item].updateUser.email, template.versions[item].versionNumber, template.versions[item].updateTime]);
                }
            }
            logger.info(table.toString());
        })

/**var getProjectId = require("../getProjectId");

const limit = 10;

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

const util = require('util');
const tableHead = [
  "Email", "Version Number", "Update Time"
];

module.exports = new Command("remoteconfig:versions:list")
  .description("Gets versions list for default active Firebase project")
  .option("--limit <number>", "returns number of versions based on specified number")
  .before(requireAuth)
  .action(
    async (options) => {
      
    //firebase remoteconfig:versions:list implementation
    const versions = await rcVersion.getVersions(getProjectId(options));
    
    console.log(versions)
    const table = new Table({ head: tableHead, style: { head: ["green"] } });
    
    
    let counter = 0;
    for(let item in versions){
        table.push([versions[item].updateUser.email, versions[item].versionNumber, versions[item].updateTime])
        counter++;
      if (counter === limit){
        table.push("","", "+more...");
        break;
      }
    }
    table.push(["Email",updatedUser])

    const updatedVersionNumber = getItems(versions.versionNumber);
    table.push(["Version Number",updatedVersionNumber])

    const updatedTime = getItems(versions.updateTime);
    table.push(["Update Time",updatedTime])

    logger.info(table.toString());
    var counter = 0;
    versions.forEach(({updateUser, versionNumber, updateTime}) => { 
        table.push([updateUser.email, versionNumber, updateTime])
        counter ++;
        if (counter === 10) {
            table.push("+more...");
            break
        }
    });

    logger.info(table.toString()); 
}) */