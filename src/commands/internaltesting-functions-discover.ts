import { Command } from "../command";
import { Options } from "../options";
import { logger } from "../logger";
import { maybeLoadCodebasesWithConfig } from "../deploy/functions/prepare";
import { normalizeAndValidate } from "../functions/projectConfig";
import { getProjectAdminSdkConfigOrCached } from "../emulator/adminSdkConfig";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import * as ensureApiEnabled from "../ensureApiEnabled";
import { runtimeconfigOrigin } from "../api";

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
    
    // Check if runtime config API is enabled
    const runtimeConfigApiEnabled = await ensureApiEnabled.check(
      projectId,
      runtimeconfigOrigin(),
      "runtimeconfig",
      /* silent=*/ true
    );
    
    // Use the new function that respects the experiment flag
    const { wantBuilds } = await maybeLoadCodebasesWithConfig(
      projectId,
      fnConfig,
      options,
      firebaseConfig,
      runtimeConfigApiEnabled,
      undefined, // no filters
    );
    
    logger.info(JSON.stringify(wantBuilds, null, 2));
    return wantBuilds;
  });
