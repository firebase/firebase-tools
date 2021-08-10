import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { listExtensions } from "../extensions/listExtensions";
import { ensureExtensionsApiEnabled } from "../extensions/extensionsHelper";
import { requirePermissions } from "../requirePermissions";

module.exports = new Command("ext:list")
  .description("list all the extensions that are installed in your Firebase project")
  .before(requirePermissions, ["firebaseextensions.instances.list"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .action((options: any) => {
    const projectId = needProjectId(options);
    return listExtensions(projectId);
  });
