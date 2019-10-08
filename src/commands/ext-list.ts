import * as Command from "../command";
import * as getProjectId from "../getProjectId";
import { listExtensions } from "../extensions/listExtensions";
import { ensureExtensionsApiEnabled } from "../extensions/extensionsHelper";
import * as requirePermissions from "../requirePermissions";

module.exports = new Command("ext:list")
  .description("list all the extensions that are installed in your Firebase project")
  .before(requirePermissions, ["firebasemods.instances.list"])
  .before(ensureExtensionsApiEnabled)
  .action((options: any) => {
    const projectId = getProjectId(options);
    return listExtensions(projectId);
  });
