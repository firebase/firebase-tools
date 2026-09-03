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
import {
  createMigrationPlan,
  ensureInstanceUpToDate,
  migrateSecrets,
  uninstallExtension,
} from "../extensions/migrate";
import { functionsEnvFromInstance } from "../extensions/export";
import { installKitOrInstance } from "../functions/kits/install";
import { validateNpmPackageName } from "../functions/kits";
import { Options } from "../options";
import { logLabeledBullet, logLabeledWarning } from "../utils";
import { FirebaseError } from "../error";
import { deploy, TARGET_PERMISSIONS } from "../deploy";
import { checkServiceAccountIam } from "../deploy/functions/checkIam";
import { confirm } from "../prompt";

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
  .before(requirePermissions, [
    "firebaseextensions.instances.list",
    "firebaseextensions.instances.delete",
    ...TARGET_PERMISSIONS["functions"],
  ])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .before((options: Options) => {
    const projectId = needProjectId(options);
    return checkServiceAccountIam(projectId);
  })
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

    const installResult = await installKitOrInstance({
      ...options,
      config: options.config,
      package: plan.kitPackage,
      template: "migration",
      seedEnv: {
        projectId,
        envs: exportedEnvs,
      },
      skipReport: true,
    });

    const kitInstanceId = installResult.instanceId;
    if (!kitInstanceId) {
      throw new FirebaseError("Kit installation failed: no instance ID returned.", { exit: 1 });
    }

    logLabeledBullet(logPrefix, `Deploying functions kit instance ${clc.bold(kitInstanceId)}...`);

    const deployOptions: Options = {
      ...options,
      only: `functions:${kitInstanceId}`,
      filteredTargets: ["functions"],
      project: projectId,
    };

    try {
      await deploy(["functions"], deployOptions);
    } catch (err: unknown) {
      throw new FirebaseError(
        `Failed to deploy. Please fix and retry with firebase deploy --only functions:${kitInstanceId}. After success you may remove the old extension with firebase ext:uninstall ${plan.instanceId} --project ${projectId} --immediate`,
        { original: err instanceof Error ? err : undefined, exit: 1 },
      );
    }

    const shouldUninstall = await confirm({
      message: `Functions kit ${kitInstanceId} successfully deployed. After checking function logs to verify that your backend is performing correctly, you should uninstall extension instance ${plan.instanceId}. Uninstall it now?`,
      default: true,
      nonInteractive: options.nonInteractive,
      force: options.force,
    });

    if (!shouldUninstall) {
      logLabeledBullet(
        logPrefix,
        `You may safely uninstall extension instance ${clc.bold(plan.instanceId)} in the future with the command ${clc.bold(`firebase ext:uninstall ${plan.instanceId} --project ${projectId} --immediate`)}`,
      );
      return plan;
    }

    await uninstallExtension(projectId, plan.instanceId, options, true);
    return plan;
  });
