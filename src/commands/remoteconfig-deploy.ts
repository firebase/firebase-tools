// import { Command } from "../command";
// import { requireAuth } from "../requireAuth";
// import Table = require("cli-table");
// import * as logger from "../logger";
// import * as fs from "fs";
// import getProjectId = require("../getProjectId");
// import util = require("util");
// import requireConfig = require("../requireConfig");
// import * as rcDeploy from "../remoteconfig/deploy";

// module.exports = new Command("remoteconfig:deploy")
//   .description("Deploys Firebase project you have access to")
//   .option("--force", "forces deployment of project, ignores template validation")
//   .before(requireAuth)
//   .action(async (options) => {
//     var filePath = options.config.get("remoteconfig.template");
//     const templateString = fs.readFileSync(filePath).toString();
//     console.log(templateString);
//     const template : rcDeploy.RemoteConfigTemplate = JSON.parse(templateString);
//     if (!options.force) {
//         rcDeploy.validate(template);
//     }
//    });