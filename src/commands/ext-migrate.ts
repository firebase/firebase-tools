import * as clc from "colorette";
import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import {
  ensureExtensionsApiEnabled,
  ensureInstanceSpec,
  logPrefix,
} from "../extensions/extensionsHelper";
import { requirePermissions } from "../requirePermissions";
import { createMigrationPlan, ensureInstanceUpToDate, migrateSecrets } from "../extensions/migrate";
import { functionsEnvFromInstance } from "../extensions/export";
import { installKitOrInstance } from "../functions/kits/install";
import { validateNpmPackageName } from "../functions/kits";
import { Options } from "../options";
import { logLabeledBullet, logLabeledWarning } from "../utils";
import { FirebaseError } from "../error";
import { logger } from "../logger";

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
    if (!options.config) {
      throw new FirebaseError("Not in a Firebase project directory (firebase.json not found).");
    }
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

    if (plan.instance.state !== "ACTIVE") {
      logLabeledWarning(
        logPrefix,
        `Extension instance ${clc.bold(plan.instanceId)} is in state ${plan.instance.state}. Migration may not function as expected.`,
      );
    }

    plan.instance = await ensureInstanceSpec(plan.instance);
    if (!plan.instance.config?.source?.spec) {
      throw new FirebaseError(
        `Could not load extension specification for ${clc.bold(plan.instanceId)}. Unable to export configuration.`,
      );
    }

    const exportedEnvs = functionsEnvFromInstance(plan.instance);

    await migrateSecrets(plan.instance, { force: options.force });

    logLabeledBullet(
      logPrefix,
      `Installing kit ${clc.bold(plan.kitPackage)} for instance ${clc.bold(plan.instanceId)}...`,
    );

    await installKitOrInstance({
      ...options,
      config: options.config,
      package: plan.kitPackage,
      template: "migration",
      defaultInstanceId: plan.instanceId,
      seedEnv: {
        projectId,
        envs: exportedEnvs,
      },
      skipReport: true,
    });

    logger.info("TODO: Draw the rest of the owl");
    return plan;
  });
