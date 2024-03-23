import { marked } from "marked";
import * as TerminalRenderer from "marked-terminal";

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

marked.setOptions({
  renderer: new TerminalRenderer(),
});

export const command = new Command("ext:uninstall <extensionInstanceId>")
  .description("uninstall an extension that is installed in your Firebase project by instance ID")
  .option("--local", "deprecated")
  .withForce()
  .before(requirePermissions, ["firebaseextensions.instances.delete"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .before(diagnoseAndFixProject)
  .action((instanceId: string, options: Options) => {
    if (options.local) {
      logLabeledWarning(
        logPrefix,
        "As of firebase-tools@11.0.0, the `--local` flag is no longer required, as it is the default behavior.",
      );
    }
    const config = manifest.loadConfig(options);
    manifest.removeFromManifest(instanceId, config);
  });
