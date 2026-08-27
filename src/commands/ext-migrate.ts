import * as clc from "colorette";
import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { ensureExtensionsApiEnabled, logPrefix } from "../extensions/extensionsHelper";
import { requirePermissions } from "../requirePermissions";
import { createMigrationPlan, ensureInstanceUpToDate } from "../extensions/migrate";
import { validateNpmPackageName } from "../functions/kits";
import { logger } from "../logger";
import { Options } from "../options";
import { logLabeledBullet } from "../utils";

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
  .option("-f, --force", "force update and migration without prompting")
  .before(requirePermissions, ["firebaseextensions.instances.list"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .action(async (options: ExtMigrateOptions) => {
    const projectId = needProjectId(options);
    if (options.package) {
      validateNpmPackageName(options.package);
    }
    const plan = await createMigrationPlan(projectId, {
      package: options.package,
      extInstance: options.extInstance,
      extension: options.extension,
      nonInteractive: options.nonInteractive,
      force: options.force,
    });

    logLabeledBullet(
      logPrefix,
      `Selected instance ${clc.bold(plan.instanceId)} (${plan.kitPackage}) for migration.`,
    );

    plan.instance = await ensureInstanceUpToDate(projectId, plan.instance, options);

    logger.info("TODO: Draw the rest of the owl");
    return plan;
  });
