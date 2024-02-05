import { logger } from "../logger";
import * as rcVersion from "../remoteconfig/versionslist";
import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { Version, ListVersionsResult } from "../remoteconfig/interfaces";
import { datetimeString } from "../utils";

const Table = require("cli-table");

const tableHead = ["Update User", "Version Number", "Update Time"];

function pushTableContents(table: typeof Table, version: Version): number {
  return table.push([
    version.updateUser?.email,
    version.versionNumber,
    version.updateTime ? datetimeString(new Date(version.updateTime)) : "",
  ]);
}

export const command = new Command("remoteconfig:versions:list")
  .description(
    "get a list of Remote Config template versions that have been published for a Firebase project",
  )
  .option(
    "--limit <maxResults>",
    "limit the number of versions being returned. Pass '0' to fetch all versions.",
  )
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfig.configs.get"])
  .action(async (options) => {
    const versionsList: ListVersionsResult = await rcVersion.getVersions(
      needProjectId(options),
      options.limit,
    );
    const table = new Table({ head: tableHead, style: { head: ["green"] } });
    for (let item = 0; item < versionsList.versions.length; item++) {
      pushTableContents(table, versionsList.versions[item]);
    }
    logger.info(table.toString());
    return versionsList;
  });
