import * as rcVersion from "../remoteconfig/versionslist";
import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import Table = require("cli-table");
import * as logger from "../logger";
import getProjectId = require("../getProjectId");
import { Version } from "../remoteconfig/interfaces";

const tableHead = ["Update User", "Version Number", "Update Time"];

/**
 * Function pushes contents of template version to table
 * @param table Input is a Table class
 * @param version Input is Version interface
 * @return {Table} Returns a table with the published contents of the version template icluding user's email, version number, and update time
 */
function tablePushContents(table: Table, version: Version) {
  table.push([version?.updateUser?.email, version?.versionNumber, version?.updateTime]);
}

// Created if statements below to filter through possibilities for --limit. Used helper method above to simplify code
module.exports = new Command("remoteconfig:versions:list")
  .description("Gets versions list for default active Firebase project")
  .option("--limit <number>", "returns number of versions based on specified number")
  .before(requireAuth)
  .action(async (options) => {
    const template = await rcVersion.getVersions(getProjectId(options));
    const table = new Table({ head: tableHead, style: { head: ["green"] } });
    const printLimit = !!options.limit;
    if (printLimit) {
      if (options.limit == 0) {
        for (let item = 0; item < template.versions.length; item++) {
          if (Object.prototype.hasOwnProperty.call(template.versions, item)) {
            tablePushContents(table, template.versions[item]);
          }
        }
      } else {
        for (let item = 0; item < template.versions.slice(0, options.limit).length; item++) {
          if (Object.prototype.hasOwnProperty.call(template.versions, item)) {
            tablePushContents(table, template.versions[item]);
          }
        }
      }
    } else {
      for (let item = 0; item < template.versions.slice(0, 10).length; item++) {
        if (Object.prototype.hasOwnProperty.call(template.versions, item)) {
          tablePushContents(table, template.versions[item]);
        }
      }
    }
    logger.info(table.toString());
  });
