import * as path from "path";

import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as templates from "../ailogic/templates";
import * as clc from "colorette";
import * as utils from "../utils";
import { logger } from "../logger";
import { FirebaseError, getErrStatus } from "../error";
import * as fsutils from "../fsutils";
import { confirm } from "../prompt";

import { Options } from "../options";

interface DeployOptions extends Options {
  dir?: string;
  prune?: boolean;
}

export const command = new Command("ailogic:templates:deploy")
  .description("deploy server prompt templates from local files")
  .help(
    `deploys every ${templates.PROMPT_FILE_EXT} file in the prompts directory as a server prompt template. The file name (without the extension) becomes the template id: new ids are created, existing ids are updated, and with --prune remote templates that have no local file are deleted after confirmation.

The directory defaults to '${templates.DEFAULT_PROMPTS_DIR}' and is resolved relative to the project root (or the current directory outside a project). Locked templates block the whole deploy; unlock them first with ailogic:templates:unlock.

For example, to deploy all templates from the default directory and delete remote templates not present locally:

  firebase ailogic:templates:deploy --prune`,
  )
  .option(
    "--dir <path>",
    `directory containing ${templates.PROMPT_FILE_EXT} files (default: ${templates.DEFAULT_PROMPTS_DIR})`,
  )
  .option(
    "--prune",
    `delete remote templates with no matching local ${templates.PROMPT_FILE_EXT} file`,
  )
  .option("-f, --force", "bypass the confirmation prompt when pruning")
  .before(requirePermissions, [
    // Deploy reads the remote state (get), creates/updates (update), and with
    // --prune deletes; preflight all three so a partial deploy cannot start
    // with permissions that only cover part of the plan.
    "firebasevertexai.templates.update",
    "firebasevertexai.templates.get",
    "firebasevertexai.templates.delete",
    // ensureAILogicApiEnabled reads API enablement state via Service Usage.
    "serviceusage.services.get",
  ])
  .action(async (options: DeployOptions) => {
    const projectId = needProjectId(options);
    // `--dir` has no Commander default so we can tell an explicit `--dir` apart from
    // the implicit default: an explicit missing directory is an error, whereas a
    // missing default directory is a no-op.
    const dirExplicit = typeof options.dir === "string";
    // Resolve against the project root so the command behaves the same from any
    // subdirectory; outside a project (bare --project) it falls back to the cwd.
    const dir = path.resolve(
      options.projectRoot ?? ".",
      options.dir ?? templates.DEFAULT_PROMPTS_DIR,
    );

    // Read and validate all local input before the API-enablement flow, so bad
    // input fails fast and every invalid file is reported in one pass.
    if (!fsutils.dirExistsSync(dir)) {
      if (dirExplicit) {
        throw new FirebaseError(`Directory does not exist: ${dir}`);
      }
      logger.info(`Default prompts directory '${dir}' does not exist. No templates to deploy.`);
      return { deployed: [], pruned: [], unchanged: [] };
    }

    const local = templates.readPromptDirectory(dir);
    if (local.errors.length > 0) {
      throw new FirebaseError(
        ["The following prompt files failed validation:"]
          .concat(local.errors.map((e) => `  ${e.file}: ${e.error}`))
          .join("\n"),
      );
    }
    if (local.templates.size === 0) {
      if (options.prune) {
        // Refuse to interpret an empty directory as "delete every remote template".
        utils.logWarning(
          `--prune was ignored: no ${templates.PROMPT_FILE_EXT} files found in '${dir}'.`,
        );
      }
      logger.info(`No ${templates.PROMPT_FILE_EXT} files found to deploy.`);
      return { deployed: [], pruned: [], unchanged: [] };
    }

    await ailogic.ensureAILogicApiEnabled(projectId, options);

    const remote = await ailogic.listTemplates(projectId);
    const plan = templates.planTemplateDeploy(local.templates, remote, options.prune ?? false);
    // Etags from the listing let the server reject (409) writes against templates
    // that changed after planning, instead of silently overwriting the newer state.
    const remoteEtags = new Map(remote.map((t) => [ailogic.templateIdFromName(t.name), t.etag]));

    // Locked templates block the whole deploy during planning; --force does not override a lock.
    if (plan.lockedViolations.length > 0) {
      throw new FirebaseError(
        `The following templates are locked and cannot be updated or deleted:\n\n` +
          plan.lockedViolations.map((id) => `  ${id}`).join("\n") +
          `\n\nUnlock them by running:\n\n  firebase ailogic:templates:unlock <templateId>\n\nThen deploy again. No templates were deployed.`,
      );
    }

    if (plan.unchanged.length > 0) {
      logger.info(
        `Skipping ${plan.unchanged.length} unchanged template(s): ${plan.unchanged.join(", ")}`,
      );
    }
    if (plan.creates.length === 0 && plan.updates.length === 0 && plan.deletes.length === 0) {
      utils.logSuccess("All templates are already up to date.");
      return { deployed: [], pruned: [], unchanged: plan.unchanged };
    }

    // confirm() aborts in non-interactive mode unless --force is set.
    if (plan.deletes.length > 0) {
      const confirmed = await confirm({
        message:
          `This will delete the following remote templates that do not exist locally:\n\n` +
          plan.deletes.map((id) => `  ${id}`).join("\n") +
          `\n\nAre you sure you want to proceed?`,
        force: options.force,
        nonInteractive: options.nonInteractive,
      });
      if (!confirmed) {
        throw new FirebaseError("Command aborted.", { exit: 1 });
      }
    }

    // Apply sequentially so the progress log stays ordered and a mid-deploy failure
    // leaves a comprehensible prefix of applied changes.
    for (const templateId of plan.creates) {
      logger.info(`Creating template ${clc.bold(templateId)}...`);
      await ailogic.updateTemplate(projectId, templateId, {
        // The id came from the map's own keys, so the lookup always succeeds.
        templateString: local.templates.get(templateId) ?? "",
        displayName: templateId,
      });
    }
    for (const templateId of plan.updates) {
      logger.info(`Updating template ${clc.bold(templateId)}...`);
      const etag = remoteEtags.get(templateId);
      try {
        // Mask the write to templateString: an unmasked PATCH replaces the whole
        // resource, which would clear a displayName set outside this deploy. The
        // body etag stays enforced as a precondition under the mask.
        await ailogic.updateTemplate(
          projectId,
          templateId,
          {
            templateString: local.templates.get(templateId) ?? "",
            ...(etag ? { etag } : {}),
          },
          ["templateString"],
        );
      } catch (err: unknown) {
        if (getErrStatus(err) === 409) {
          throw new FirebaseError(
            `Template ${clc.bold(templateId)} was modified while deploying. Re-run the deploy to apply your local files against the latest remote state.`,
          );
        }
        throw err;
      }
    }
    for (const templateId of plan.deletes) {
      logger.info(`Pruning template ${clc.bold(templateId)}...`);
      try {
        await ailogic.deleteTemplate(projectId, templateId, remoteEtags.get(templateId));
      } catch (err: unknown) {
        // The template can be deleted out from under us between the plan and this
        // delete; the desired end state is reached, so don't fail the deploy.
        if (getErrStatus(err) === 404) {
          logger.info(`Template ${clc.bold(templateId)} was already deleted.`);
          continue;
        }
        if (getErrStatus(err) === 409) {
          throw new FirebaseError(
            `Template ${clc.bold(templateId)} was modified while deploying, so it was not pruned. Re-run the deploy to plan against the latest remote state.`,
          );
        }
        throw err;
      }
    }

    utils.logSuccess("Successfully deployed templates.");
    return {
      deployed: [...plan.creates, ...plan.updates],
      pruned: plan.deletes,
      unchanged: plan.unchanged,
    };
  });
