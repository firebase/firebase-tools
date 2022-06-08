import { checkMinRequiredVersion } from "../checkMinRequiredVersion.js";
import { Command } from "../command.js";
import { needProjectId } from "../projectUtils.js";
import { logger } from "../logger.js";
import {
  createSourceFromLocation,
  ensureExtensionsApiEnabled,
} from "../extensions/extensionsHelper";
import { requirePermissions } from "../requirePermissions.js";

/**
 * Command for creating a extension source
 */
export const command = new Command("ext:sources:create <sourceLocation>")
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
