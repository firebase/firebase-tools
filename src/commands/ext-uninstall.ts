// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import TerminalRenderer = require("marked-terminal");

import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { ensureExtensionsApiEnabled, diagnoseAndFixProject } from "../extensions/extensionsHelper";
import { requirePermissions } from "../requirePermissions";
import * as manifest from "../extensions/manifest";
import { Options } from "../options";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

export default new Command("ext:uninstall <extensionInstanceId>")
  .description("uninstall an extension that is installed in your Firebase project by instance ID")
  .withForce()
  .before(requirePermissions, ["firebaseextensions.instances.delete"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .before(diagnoseAndFixProject)
  .action((instanceId: string, options: Options) => {
    const config = manifest.loadConfig(options);
    manifest.removeFromManifest(instanceId, config);
    manifest.showPostDeprecationNotice();
  });
