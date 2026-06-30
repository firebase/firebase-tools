import { Command } from "../command";
import { Options } from "../options";
import { logger } from "../logger";
import { loadCodebases } from "../deploy/functions/prepare";
import { normalizeAndValidate, shouldUseRuntimeConfig } from "../functions/projectConfig";
import { getProjectAdminSdkConfigOrCached } from "../emulator/adminSdkConfig";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import * as ensureApiEnabled from "../ensureApiEnabled";
import { runtimeconfigOrigin } from "../api";
import { getFunctionsConfig } from "../deploy/functions/prepareFunctionsUpload";
import * as build from "../deploy/functions/build";
import * as self from "./functions-lifecycle-list";

export async function loadCodebaseBuild(codebase: string, options: Options): Promise<build.Build> {
  const projectId = needProjectId(options);
  if (!options.config) {
    throw new FirebaseError("Not in a Firebase project directory (firebase.json not found).");
  }
  const fnConfig = normalizeAndValidate(options.config.src.functions);

  const hasCodebase = fnConfig.some((c) => c.codebase === codebase);
  if (!hasCodebase) {
    throw new FirebaseError(`Codebase "${codebase}" is not defined in firebase.json.`);
  }

  const firebaseConfig = await getProjectAdminSdkConfigOrCached(projectId);
  if (!firebaseConfig) {
    throw new FirebaseError(
      "Admin SDK config unexpectedly undefined - have you run firebase init?",
    );
  }

  let runtimeConfig: Record<string, unknown> = { firebase: firebaseConfig };

  if (fnConfig.some(shouldUseRuntimeConfig)) {
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

  const codebaseBuild = wantBuilds[codebase];
  if (!codebaseBuild) {
    throw new FirebaseError(`Failed to load build for codebase "${codebase}".`);
  }

  return codebaseBuild;
}

export const command = new Command("functions:lifecycle:list <codebase>")
  .description("list all the lifecycle hooks defined in a codebase")
  .action(async (codebase: string, options: Options) => {
    const codebaseBuild = await self.loadCodebaseBuild(codebase, options);
    const hooks = codebaseBuild.lifecycleHooks || {};

    if (Object.keys(hooks).length === 0) {
      logger.info(`No lifecycle hooks configured for codebase "${codebase}".`);
      return hooks;
    }

    for (const [event, hook] of Object.entries(hooks)) {
      logger.info(`\nEvent: ${event}`);
      if ("task" in hook) {
        logger.info(`  Action: Task`);
        logger.info(`  Target Function: ${hook.task.function}`);
        if (hook.task.body) {
          logger.info(`  Body: ${JSON.stringify(hook.task.body, null, 2).replace(/\n/g, "\n  ")}`);
        }
      } else if ("call" in hook) {
        logger.info(`  Action: Call`);
        logger.info(`  Target Function: ${hook.call.function}`);
        if (hook.call.params) {
          logger.info(
            `  Params: ${JSON.stringify(hook.call.params, null, 2).replace(/\n/g, "\n  ")}`,
          );
        }
      } else if ("http" in hook) {
        logger.info(`  Action: HTTP`);
        if (hook.http.function) {
          logger.info(`  Target Function: ${hook.http.function}`);
        }
        if (hook.http.url) {
          logger.info(`  URL: ${hook.http.url}`);
        }
        if (hook.http.method) {
          logger.info(`  Method: ${hook.http.method}`);
        }
        if (hook.http.headers) {
          logger.info(
            `  Headers: ${JSON.stringify(hook.http.headers, null, 2).replace(/\n/g, "\n  ")}`,
          );
        }
        if (hook.http.body) {
          logger.info(`  Body: ${JSON.stringify(hook.http.body, null, 2).replace(/\n/g, "\n  ")}`);
        }
      }
    }

    return hooks;
  });
