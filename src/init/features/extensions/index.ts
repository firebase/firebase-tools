import { requirePermissions } from "../../../requirePermissions.js";
import { Options } from "../../../options.js";
import { ensure } from "../../../ensureApiEnabled.js";
import { Config } from "../../../config.js";
import * as manifest from "../../../extensions/manifest.js";
import { extensionsOrigin } from "../../../api.js";

/**
 * Set up a new firebase project for extensions.
 */
export async function doSetup(setup: any, config: Config, options: Options): Promise<any> {
  const projectId = setup?.rcfile?.projects?.default;
  if (projectId) {
    await requirePermissions({ ...options, project: projectId });
    await Promise.all([ensure(projectId, extensionsOrigin(), "unused", true)]);
  }
  return manifest.writeEmptyManifest(config, options);
}
