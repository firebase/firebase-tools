import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { ensureExtensionsApiEnabled } from "../extensions/extensionsHelper";
import { requirePermissions } from "../requirePermissions";
import { migrate } from "../extensions/migrate";
import { Options } from "../options";

export interface ExtMigrateOptions extends Options {
  package?: string;
  extInstance?: string;
  extension?: string;
}

export const command = new Command("ext:migrate")
  .description("migrate an extension instance to a function kit")
  .option("-p, --package <package>", "optional kit package override to use")
  .option("-i, --ext-instance <instanceId>", "extension instance ID to migrate")
  .option("-e, --extension <extensionRef>", "extension reference or name to migrate")
  .before(requirePermissions, ["firebaseextensions.instances.list"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .action(async (options: ExtMigrateOptions) => {
    const projectId = needProjectId(options);
    return migrate(projectId, {
      package: options.package,
      extInstance: options.extInstance,
      extension: options.extension,
      nonInteractive: options.nonInteractive,
    });
  });
