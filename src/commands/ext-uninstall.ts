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
      await uninstallExtension(projectId, instanceId, options, false);
      return;
    }
    const config = manifest.loadConfig(options);
    manifest.removeFromManifest(instanceId, config);
  });
