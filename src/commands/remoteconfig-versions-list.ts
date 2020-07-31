import * as logger from "../logger";
import * as rcVersion from "../remoteconfig/versionslist";
import { Command } from "../command";
import getProjectId = require("../getProjectId");
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { Version, ListVersionsResult } from "../remoteconfig/interfaces";

import Table = require("cli-table");

const tableHead = ["Update User", "Version Number", "Update Time"];

function pushTableContents(table: Table, version: Version): number {
  return table.push([version?.updateUser?.email, version?.versionNumber, version?.updateTime]);
}
// Call inner body once so that you won't have to lloop three times
module.exports = new Command("remoteconfig:versions:list")
  .description(
    "Get a list of Remote Config template versions that have been published for a Firebase project"
  )
  .option("--limit <number>", "limit the number of versions being returned")
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfig.configs.get"])
  .action(async (options) => {
    const versionsList: ListVersionsResult = await rcVersion.getVersions(getProjectId(options));
    const table = new Table({ head: tableHead, style: { head: ["green"] } });
    const printLimit = !!options.limit;

    for (let item = 0; item < versionsList.versions.length; item++) {
      if (Object.prototype.hasOwnProperty.call(versionsList.versions, item)) {
        if (printLimit) {
          if (options.limit == 0) {
            pushTableContents(table, versionsList.versions[item]);
          } else {
            if (item < options.limit) {
              pushTableContents(table, versionsList.versions[item]);
            } else {
              break;
            }
          }
        } else {
          if (item < 10) {
            pushTableContents(table, versionsList.versions[item]);
          } else {
            break;
          }
        }
      }
    }
    logger.info(table.toString());
  });
