import * as Command from "../command";
import * as getProjectId from "../getProjectId";
import { listMods } from "../extensions/listMods";
import { ensureModsApiEnabled } from "../extensions/modsHelper";
import * as requirePermissions from "../requirePermissions";

module.exports = new Command("ext:list")
  .description("list all the extensions that are installed in your Firebase project")
  .before(requirePermissions, [
    // TODO: this doesn't exist yet, uncomment when it does
    // "firebasemods.instances.list"
  ])
  .before(ensureModsApiEnabled)
  .action((options: any) => {
    const projectId = getProjectId(options);
    return listMods(projectId);
  });
