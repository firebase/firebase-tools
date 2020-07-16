import * as rcVersion from "../remoteconfig/versionslist";
import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import Table = require("cli-table");
import * as logger from "../logger";

let getProjectId = require("../getProjectId");

const tableHead = ["UpdateUser", "Version Number", "Update Time"];

// Firebase remoteconfig:versions:list implementation
module.exports = new Command("remoteconfig:versions:list")
    .description("Gets versions list for default active Firebase project")
    .option("--limit <number>", "returns number of versions based on specified number")
    .before(requireAuth)
    .action(
        async (options) => {
            const template = await rcVersion.getVersions(getProjectId(options));
            const table = new Table({ head: tableHead, style: { head: ["green"] } });
            var printLimit = !!options.limit;
            if (printLimit) {
                if (options.limit == 0) {
                    for (let item in template.versions) {
                        table.push([template.versions[item].updateUser.email, template.versions[item].versionNumber, template.versions[item].updateTime]);
                    }
                } else {
                    for (let item in template.versions.slice(0,options.limit)) {
                        table.push([template.versions[item].updateUser.email, template.versions[item].versionNumber, template.versions[item].updateTime]);
                    }
                }
            } else {
                for (let item in template.versions.slice(0,10)) {
                    table.push([template.versions[item].updateUser.email, template.versions[item].versionNumber, template.versions[item].updateTime]);
                }
            }
            logger.info(table.toString());
        });