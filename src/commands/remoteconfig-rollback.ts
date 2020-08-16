import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import * as rcRollback from "../remoteconfig/rollback";
import { requirePermissions } from "../requirePermissions";

import * as rcList from "../remoteconfig/versionslist";

import getProjectId = require("../getProjectId");
import { prompt } from "../prompt";
import { FirebaseError } from "../error";

module.exports = new Command("remoteconfig:rollback")
  .description(
    "Roll back a project's published Remote Config template to the one specified by the provided version number"
  )
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfig.configs.get", "cloudconfig.configs.update"])
  .option(
    "-v, --version-number <versionNumber>",
    "rollback to the specified version of the template"
  )
  .action(async (options) => {
    const templateVersion = await rcList.getVersions(getProjectId(options), 1);
    let targetVersion = 0;
    if (options.versionNumber) {
      targetVersion = options.versionNumber;
    } else {
      if (templateVersion?.versions[0]?.versionNumber) {
        const latestVersion = templateVersion.versions[0].versionNumber.toString();
        const previousVersion = parseInt(latestVersion) - 1;
        targetVersion = previousVersion;
      }
    }
    if (targetVersion <= 0) {
      throw new FirebaseError(`Failed to rollback Firebase Remote Config template for project to ` + targetVersion + `. `+ `Invalid Version Number`);
    }
    return prompt(options, [
      {
        type: "confirm",
        name: "confirm",
        message: "Proceed to rollback template to " + targetVersion + "?",
        default: false,
      },
    ]).then(async () => {
      if (!options.confirm) {
        return;
      }
      await rcRollback.rollbackTemplate(getProjectId(options), targetVersion);
    });
  });
