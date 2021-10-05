import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import * as planner from "../deploy/extensions/planner";
import { ensureExtensionsApiEnabled } from "../extensions/extensionsHelper";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";

module.exports = new Command("ext:export")
  .description("export all Extension instances installed on a project to a local Firebase directory")
  .before(requirePermissions, ["firebaseextensions.instances.list"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .action((options: any) => {
    /**
     * Outline:
     * Get 'have'
     * Generate map of extensions for firebase.json (add ^ to versions)
     * Turn params for each into .env strings
     * Prompt to write to files
     * Write to files
     */
    const projectId = needProjectId(options);

    const have = planner.have(projectId);
    
  });