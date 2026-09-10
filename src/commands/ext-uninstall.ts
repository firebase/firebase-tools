import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import {
  ensureExtensionsApiEnabled,
  diagnoseAndFixProject,
  logPrefix,
} from "../extensions/extensionsHelper";
import { requirePermissions } from "../requirePermissions";
import { logLabeledWarning } from "../utils";
import * as manifest from "../extensions/manifest";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { uninstallExtension } from "../extensions/migrate";
import { getInstance } from "../extensions/extensionsApi";
import { secretsNeedingEjection } from "../extensions/export";
import { FirebaseError } from "../error";
import { ExtensionInstance } from "../extensions/types";
import { confirm } from "../prompt";

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
      let instance: ExtensionInstance | undefined;
      try {
        instance = await getInstance(projectId, instanceId);
      } catch (err: unknown) {
        if (err instanceof FirebaseError && err.status === 404) {
          logLabeledWarning(
            logPrefix,
            "ext:uninstall called with --immediate, but no deployed GCP resources found for the extension.",
          );
          return;
        }
        throw err instanceof FirebaseError ? err : new FirebaseError(String(err));
      }
      if (typeof instance === "undefined") {
        throw new FirebaseError(
          `Failed to retrieve deployed GCP resources for extension instance ${instanceId}`,
        );
      }
      const outstandingSecrets = await secretsNeedingEjection(instance);
      if (outstandingSecrets.length > 0) {
        const shouldContinue = await confirm({
          message: `Extension instance ${instanceId} has secrets with the "firebase-extensions-managed" label:\n${outstandingSecrets.join(", ")}\nContinuing with extension uninstall will permanantly destroy these secrets.\nYou can keep these secrets by running ext:export, or by manually removing the label in the Cloud Console.\nContinue? (y/N)`,
          default: false,
          nonInteractive: options.nonInteractive,
          force: options.force,
        });
        if (!shouldContinue) {
          return;
        }
      }
      await uninstallExtension(projectId, instanceId, options, false);
      return;
    }
    const config = manifest.loadConfig(options);
    manifest.removeFromManifest(instanceId, config);
  });
