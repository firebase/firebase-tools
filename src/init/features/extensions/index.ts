import { requirePermissions } from "../../../requirePermissions";
import { Options } from "../../../options";
import { ensure } from "../../../ensureApiEnabled";
import { Config } from "../../../config";
import * as manifest from "../../../extensions/manifest";

/**
 * Set up a new firebase project for extensions.
 */
export async function doSetup(setup: any, config: Config, options: Options): Promise<any> {
  const projectId = setup?.rcfile?.projects?.default;
  if (projectId) {
    await requirePermissions({ ...options, project: projectId });
    await Promise.all([ensure(projectId, "firebaseextensions.googleapis.com", "unused", true)]);
  }
  return manifest.writeEmptyManifest(config, options);
}
