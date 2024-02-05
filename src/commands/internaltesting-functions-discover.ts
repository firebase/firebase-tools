import { Command } from "../command";
import { Options } from "../options";
import { logger } from "../logger";
import { loadCodebases } from "../deploy/functions/prepare";
import { normalizeAndValidate } from "../functions/projectConfig";
import { getProjectAdminSdkConfigOrCached } from "../emulator/adminSdkConfig";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";

export const command = new Command("internaltesting:functions:discover")
  .description("discover function triggers defined in the current project directory")
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const fnConfig = normalizeAndValidate(options.config.src.functions);
    const firebaseConfig = await getProjectAdminSdkConfigOrCached(projectId);
    if (!firebaseConfig) {
      throw new FirebaseError(
        "Admin SDK config unexpectedly undefined - have you run firebase init?",
      );
    }
    const builds = await loadCodebases(fnConfig, options, firebaseConfig, {
      firebase: firebaseConfig,
    });
    logger.info(JSON.stringify(builds, null, 2));
    return builds;
  });
