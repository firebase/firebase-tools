import * as rcGet from "../remoteconfig/get";
import { Command } from "../command";
import { requireAuth } from "../requireAuth";
var getProjectId = require("../getProjectId");

module.exports = new Command("remoteconfig:get")
  .description("Get Firebase projects you have access to")
  .before(requireAuth)
  .action(
    async () => {const projects = await rcGet.getFirebaseProject("676333365279");
    console.log(projects);}
  )

 

