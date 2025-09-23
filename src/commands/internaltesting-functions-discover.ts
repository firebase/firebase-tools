import { Command } from "../command";
import { Options } from "../options";
import { logger } from "../logger";
import { loadCodebases } from "../deploy/functions/prepare";
import { normalizeAndValidate } from "../functions/projectConfig";
import { getProjectAdminSdkConfigOrCached } from "../emulator/adminSdkConfig";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import * as ensureApiEnabled from "../ensureApiEnabled";
import { runtimeconfigOrigin } from "../api";
import * as experiments from "../experiments";
import { getFunctionsConfig } from "../deploy/functions/prepareFunctionsUpload";

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

    let runtimeConfig: Record<string, unknown> = { firebase: firebaseConfig };
    const allowFunctionsConfig = experiments.isEnabled("dangerouslyAllowFunctionsConfig");

    if (allowFunctionsConfig) {
      try {
        const runtimeConfigApiEnabled = await ensureApiEnabled.check(
          projectId,
          runtimeconfigOrigin(),
          "runtimeconfig",
          /* silent=*/ true,
        );

        if (runtimeConfigApiEnabled) {
          runtimeConfig = { ...runtimeConfig, ...(await getFunctionsConfig(projectId)) };
        }
      } catch (err) {
        logger.debug("Could not check Runtime Config API status, assuming disabled:", err);
      }
    }

    const wantBuilds = await loadCodebases(
      fnConfig,
      options,
      firebaseConfig,
      runtimeConfig,
      undefined, // no filters
    );

    logger.info(JSON.stringify(wantBuilds, null, 2));
    return wantBuilds;
  });
