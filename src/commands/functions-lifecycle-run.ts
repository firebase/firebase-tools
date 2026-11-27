import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";
import { FirebaseError } from "../error";
import { loadCodebaseBuild } from "./functions-lifecycle-list";
import * as backend from "../deploy/functions/backend";
import { executeHook } from "../deploy/functions/release/lifecycle";
import { Context } from "../deploy/functions/args";

export const command = new Command("functions:lifecycle:run <hookName> <codebase>")
  .description("run a specific lifecycle hook in isolation")
  .before(requirePermissions, ["cloudfunctions.functions.list", "run.services.list"])
  .action(async (hookName: string, codebase: string, options: Options) => {
    if (hookName !== "afterFirstDeploy" && hookName !== "afterRedeploy") {
      throw new FirebaseError(
        `Invalid hook name "${hookName}". Supported hooks are "afterFirstDeploy" and "afterRedeploy".`,
      );
    }

    const projectId = needProjectId(options);
    const codebaseBuild = await loadCodebaseBuild(codebase, options);
    const hook = codebaseBuild.lifecycleHooks?.[hookName];

    if (!hook) {
      throw new FirebaseError(
        `No lifecycle hook "${hookName}" configured for codebase "${codebase}".`,
      );
    }

    const context = {
      projectId,
    } as Context;

    const existingBackend = await backend.existingBackend(context);

    await executeHook(hookName, hook, existingBackend);
  });
