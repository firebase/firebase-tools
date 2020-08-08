import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import getProjectId = require("../getProjectId");
import * as rcRollback from "../remoteconfig/rollback";
import * as rcGet from "../remoteconfig/get";

var {prompt} = require("../prompt");

module.exports = new Command("remoteconfig:rollback")
  .description("Roll back a project's published Remote Config template to the one specified by the provided version number")
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfig.configs.get"])
  .option("-v, --version-number <versionNumber>", "rollback to the specified version of the template")
  .action(async (options) => {
    var template = await rcGet.getTemplate(getProjectId(options));
    let targetVersion = 0;
    if (options.versionNumber) {
      targetVersion = options.versionNumber;
    } else {
      if (template?.version?.versionNumber) {
        const latestVersion = template.version.versionNumber.toString();
        const previousVersion = parseInt(latestVersion) - 1;
        targetVersion = previousVersion;
      }
    }

    //const latestVersion = template?.version?.versionNumber;
    //var targetVersion = options.versionNumber? option.versionNumber: parseInt(latestVersion) - 1
    return prompt(options, [
      {
        type: "confirm",
        name: "confirm",
        message: "Proceed to rollback template to " + targetVersion + "?",
        default: false,
      }
    ]).then(async function(){
      if (!options.confirm) {
        return;
      }
      await rcRollback.rollbackTemplate(
          getProjectId(options),
          options.versionNumber
        );
    })
  });