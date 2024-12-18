import { Command } from "../command.js";
import { FirebaseError } from "../error.js";
import { promptOnce } from "../prompt.js";
import { requireAuth } from "../requireAuth.js";
import { rollbackTemplate } from "../remoteconfig/rollback.js";
import { requirePermissions } from "../requirePermissions.js";
import { getVersions } from "../remoteconfig/versionslist.js";

import { needProjectId } from "../projectUtils.js";

export const command = new Command("remoteconfig:rollback")
  .description(
    "roll back a project's published Remote Config template to the one specified by the provided version number",
  )
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfig.configs.get", "cloudconfig.configs.update"])
  .option(
    "-v, --version-number <versionNumber>",
    "rollback to the specified version of the template",
  )
  .withForce()
  .action(async (options) => {
    const templateVersion = await getVersions(needProjectId(options), 1);
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
          `Invalid Version Number`,
      );
    }
    const confirm = await promptOnce(
      {
        type: "confirm",
        name: "force",
        message: "Proceed to rollback template to version " + targetVersion + "?",
        default: false,
      },
      options,
    );
    if (!confirm) {
      return;
    }
    return rollbackTemplate(needProjectId(options), targetVersion);
  });
