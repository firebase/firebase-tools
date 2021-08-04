import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import {
  createSourceFromLocation,
  ensureExtensionsApiEnabled,
} from "../extensions/extensionsHelper";
import { requirePermissions } from "../requirePermissions";

/**
 * Command for creating a extension source
 */
export default new Command("ext:sources:create <sourceLocation>")
  .description(`create a extension source from sourceLocation`)
  .help(
    "sourceLocation can be a local directory containing an extension, or URL pointing to a zipped extension. " +
      'If using a URL, you can specify a root folder for the extension by adding "#<extensionRoot>". ' +
      "For example, if your extension.yaml is in the my/extension directory of the archive, " +
      "you should use sourceUrl#my/extension. If no extensionRoot is specified, / is assumed."
  )
  .before(requirePermissions, ["firebaseextensions.sources.create"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extDevMinVersion")
  .action(async (sourceLocation: string, options: any) => {
    const projectId = needProjectId(options);
    const res = await createSourceFromLocation(projectId, sourceLocation);
    logger.info(
      `Extension source creation successful for ${res.spec.name}! Your new source is ${res.name}`
    );
    return res;
  });
