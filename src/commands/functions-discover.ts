import { Command } from "../command";
import { Options } from "../options";
import { logger } from "../logger";
import { loadCodebases } from "../deploy/functions/prepare";
import { normalizeAndValidate } from "../functions/projectConfig";
import { getProjectAdminSdkConfigOrCached } from "../emulator/adminSdkConfig";
import { needProjectId } from "../projectUtils";

import type { FirebaseConfig } from "../deploy/functions/args";

export const command = new Command("functions:discover")
  .description("Discover function triggers defined in the current project directory")
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const fnConfig = normalizeAndValidate(options.config.src.functions);
    const firebaseConfig = (await getProjectAdminSdkConfigOrCached(projectId)) as FirebaseConfig;
    const builds = await loadCodebases(fnConfig, options, firebaseConfig, {
      firebase: firebaseConfig,
    });
    logger.info(JSON.stringify(builds, null, 2));
    return builds;
  });
