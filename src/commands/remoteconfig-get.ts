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
module.exports = new Command("remoteconfig:get")
  .description("Get Firebase projects you have access to")
  .before(requireAuth)
  .action(
    async (options) => {const projects = await rcGet.getFirebaseProject(getProjectId(options));
    const table = new Table({ head: tableHead, style: { head: ["green"] } });
    table.push(["conditions", util.inspect(projects.conditions, {showHidden: false, depth: null})])
    table.push(["parameters", util.inspect(projects.parameters, {showHidden: false, depth: null})])
    table.push(["parameterGroups", util.inspect(projects.parameterGroups, {showHidden: false, depth: null})])
    table.push(["version", util.inspect(projects.version, {showHidden: false, depth: null})])
    logger.info(table.toString());
  }
  )

 

