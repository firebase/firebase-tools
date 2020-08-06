import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { RemoteConfigTemplate } from "../remoteconfig/interfaces";
import getProjectId = require("../getProjectId");
import * as rcRollback from "../remoteconfig/rollback";

module.exports = new Command("remoteconfig:rollback")
  .description("Roll back a project's published Remote Config template to the one specified by the provided version number")
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfig.configs.get"])
  .action(async (options) => {
    await rcRollback.rollbackTemplate(
        getProjectId(options),
        options.versionNumber
      );
  });