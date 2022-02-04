import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { diagnose } from "../extensions/diagnose";
import { ensureExtensionsApiEnabled } from "../extensions/extensionsHelper";
import { requirePermissions } from "../requirePermissions";

module.exports = new Command("ext:diagnose")
  .description("diagnoses the Firebase project for potential known configuration issues")
  .option("--fix", "automatically perform basic fixes")
  .before(requirePermissions, [
    "resourcemanager.projects.getIamPolicy",
    "resourcemanager.projects.setIamPolicy",
  ])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .action((options: any) => {
    const projectId = needProjectId(options);
    return diagnose(projectId, !!options.fix);
  });
