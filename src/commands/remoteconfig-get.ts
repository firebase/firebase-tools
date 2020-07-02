import * as rcGet from "../remoteconfig/get";
import { Command } from "../command";
import { requireAuth } from "../requireAuth";
var getProjectId = require("../getProjectId");

const util = require('util');

module.exports = new Command("remoteconfig:get")
  .description("Get Firebase projects you have access to")
  .before(requireAuth)
  .action(
    async (options) => {const projects = await rcGet.getFirebaseProject(getProjectId(options));
    const projectsString = util.inspect(projects, {showHidden: false, depth: null});
    console.log(projectsString)}
  )

 

