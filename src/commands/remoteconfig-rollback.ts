import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import * as rcGet from "../remoteconfig/get";
import * as rcRollback from "../remoteconfig/rollback";
import { requirePermissions } from "../requirePermissions";

import * as rcList from "../remoteconfig/versionslist";

import getProjectId = require("../getProjectId");
import { prompt } from "../prompt";

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
    // const template = await rcList.getVersions(getProjectId(options), 1);
    const template = await rcGet.getTemplate(getProjectId(options));
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
