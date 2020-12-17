import { Command } from "../command";
import { FirebaseError } from "../error";
import { prompt } from "../prompt";
import { requireAuth } from "../requireAuth";
import { rollbackTemplate } from "../remoteconfig/rollback";
import { requirePermissions } from "../requirePermissions";
import { getVersions } from "../remoteconfig/versionslist";

import getProjectId = require("../getProjectId");

module.exports = new Command("remoteconfig:rollback")
  .description(
    "roll back a project's published Remote Config template to the one specified by the provided version number"
  )
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfig.configs.get", "cloudconfig.configs.update"])
  .option(
    "-v, --version-number <versionNumber>",
    "rollback to the specified version of the template"
  )
  .option("--force", "rollback template to the specified version without confirmation")
  .action(async (options) => {
    const templateVersion = await getVersions(getProjectId(options), 1);
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
      throw new FirebaseError(
        `Failed to rollback Firebase Remote Config template for project to version` +
          targetVersion +
          `. ` +
          `Invalid Version Number`
      );
    }
    if (!options.force) {
      const { confirm } = await prompt(options, [
        {
          type: "confirm",
          name: "confirm",
          message: "Proceed to rollback template to version " + targetVersion + "?",
          default: false,
        },
      ]);
      if (!confirm) {
        return;
      }
    }
    return rollbackTemplate(getProjectId(options), targetVersion);
  });
