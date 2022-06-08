import { checkMinRequiredVersion } from "../checkMinRequiredVersion.js";
import { Command } from "../command.js";
import { needProjectId } from "../projectUtils.js";
import { listExtensions } from "../extensions/listExtensions.js";
import { ensureExtensionsApiEnabled } from "../extensions/extensionsHelper.js";
import { requirePermissions } from "../requirePermissions.js";

export const command = new Command("ext:list")
  .description("list all the extensions that are installed in your Firebase project")
  .before(requirePermissions, ["firebaseextensions.instances.list"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .action((options: any) => {
    const projectId = needProjectId(options);
    return listExtensions(projectId);
  });
