import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import {
  ensureExtensionsApiEnabled,
  diagnoseAndFixProject,
  logPrefix,
} from "../extensions/extensionsHelper";
import { requirePermissions } from "../requirePermissions";
import { logLabeledBullet, logLabeledWarning, logLabeledSuccess } from "../utils";
import * as manifest from "../extensions/manifest";
import { deleteInstance } from "../extensions/extensionsApi";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { confirm } from "../prompt";
import { FirebaseError } from "../error";

export const command = new Command("ext:uninstall <extensionInstanceId>")
  .description("uninstall an extension that is installed in your Firebase project by instance ID")
  .option("--local", "deprecated")
  .option(
    "--immediate",
    "immediately destroy GCP resources instead of waiting on next deploy. Can be run outside a firebase project directory.",
  )
  .withForce()
  .before(requirePermissions, ["firebaseextensions.instances.delete"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .before(diagnoseAndFixProject)
  .action(async (instanceId: string, options: Options) => {
    if (options.local) {
      logLabeledWarning(
        logPrefix,
        "As of firebase-tools@11.0.0, the `--local` flag is no longer required, as it is the default behavior.",
      );
    }
    if (options.immediate) {
      const projectId = needProjectId(options);
      let config;
      try {
        config = manifest.loadConfig(options);
      } catch {
        logLabeledBullet(
          logPrefix,
          "No firebase.json found. Proceeding to immediate extension instance teardown.",
        );
      }
      if (config && manifest.instanceExists(instanceId, config)) {
        manifest.removeFromManifest(instanceId, config);
      }

      if (
        !(await confirm({
          message: `About to delete Extensions instance ${projectId}/${instanceId}, its associated resources, and service account. Continue?`,
          nonInteractive: options.nonInteractive,
          force: options.force,
          default: true,
        }))
      ) {
        return;
      }
      try {
        await deleteInstance(projectId, instanceId);
      } catch (err: unknown) {
        throw new FirebaseError(
          `Error when attempting deletion: ${err instanceof Error ? err.message : String(err)}`,
          { original: err instanceof Error ? err : undefined },
        );
      }
      logLabeledSuccess(logPrefix, `Deleted Extensions instance ${projectId}/${instanceId}.`);
      return;
    }
    const config = manifest.loadConfig(options);
    manifest.removeFromManifest(instanceId, config);
  });
