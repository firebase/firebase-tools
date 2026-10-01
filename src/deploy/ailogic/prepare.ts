import * as clc from "colorette";

import * as utils from "../../utils";
import { FirebaseError } from "../../error";
import { confirm } from "../../prompt";
import { needProjectId } from "../../projectUtils";
import { dirExistsSync } from "../../fsutils";
import * as ailogic from "../../gcp/ailogic";
import * as templates from "../../ailogic/templates";
import { DeployOptions } from "..";
import { AiLogicDeployContext } from "./release";

/** Sub-targets accepted after the colon in `--only ailogic:<filter>`. */
const VALID_FILTERS = ["templates"];

/**
 * Whether this deploy's `--only` selection includes the given ailogic sub-target.
 * A bare `--only ailogic` (or no --only at all) includes everything; unknown
 * filters are an error rather than a silent no-op.
 */
function filterIncludes(options: DeployOptions, subTarget: string): boolean {
  if (!options.only) {
    return true;
  }
  const filters = options.only
    .split(",")
    .filter((t) => t === "ailogic" || t.startsWith("ailogic:"))
    .map((t) => t.split(":")[1]);
  for (const f of filters) {
    if (f && !VALID_FILTERS.includes(f)) {
      throw new FirebaseError(
        `Unknown AI Logic deploy filter ${clc.bold(`ailogic:${f}`)}. Valid filters:\n\n` +
          VALID_FILTERS.map((v) => `  ailogic:${v}`).join("\n"),
      );
    }
  }
  return filters.some((f) => f === undefined || f === subTarget);
}

/**
 * Reads and validates the local prompt templates, plans the reconcile against
 * the live project, and gets the prune confirmation out of the way. All writes
 * happen later, in release.
 */
export async function prepare(
  context: AiLogicDeployContext,
  options: DeployOptions,
): Promise<void> {
  if (!filterIncludes(options, "templates")) {
    return;
  }

  const projectId = needProjectId(options);
  const templatesDir = options.config.src.ailogic?.templates ?? templates.DEFAULT_PROMPTS_DIR;
  const dir = options.config.path(templatesDir);

  // Unlike an implicit default, a declared-but-missing directory is a config
  // error: firebase.json points at something that is not there.
  if (!dirExistsSync(dir)) {
    throw new FirebaseError(
      `AI Logic templates directory ${clc.bold(templatesDir)} (from firebase.json) does not exist.`,
    );
  }

  const local = templates.readPromptDirectory(dir);
  if (local.errors.length > 0) {
    throw new FirebaseError(
      ["The following prompt files failed validation:"]
        .concat(local.errors.map((e) => `  ${e.file}: ${e.error}`))
        .join("\n"),
    );
  }

  await ailogic.ensureAILogicApiEnabled(projectId, options);

  const remote = await ailogic.listTemplates(projectId);
  // Refuse to interpret an empty directory as "delete every remote template".
  const prune = local.templates.size > 0;
  if (!prune && remote.length > 0) {
    utils.logLabeledWarning(
      "ailogic",
      `no ${templates.PROMPT_FILE_EXT} files found in ${clc.bold(templatesDir)}; ` +
        `existing remote templates were left untouched.`,
    );
  }
  const plan = templates.planTemplateDeploy(local.templates, remote, prune);

  // Locked templates block the whole deploy during planning; --force does not override a lock.
  if (plan.lockedViolations.length > 0) {
    throw new FirebaseError(
      `The following templates are locked and cannot be updated or deleted:\n\n` +
        plan.lockedViolations.map((id) => `  ${id}`).join("\n") +
        `\n\nUnlock them by running:\n\n  firebase ailogic:templates:unlock <templateId>\n\nThen deploy again. No templates were deployed.`,
    );
  }

  if (plan.unchanged.length > 0) {
    utils.logLabeledBullet(
      "ailogic",
      `skipping ${plan.unchanged.length} unchanged template(s): ${plan.unchanged.join(", ")}`,
    );
  }

  // Confirm deletions before ANY target starts writing. confirm() aborts in
  // non-interactive mode unless --force is set.
  if (plan.deletes.length > 0) {
    const confirmed = await confirm({
      message:
        `This will delete the following remote templates whose ${templates.PROMPT_FILE_EXT} files were removed:\n\n` +
        plan.deletes.map((id) => `  ${id}`).join("\n") +
        `\n\nAre you sure you want to proceed?`,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    if (!confirmed) {
      throw new FirebaseError("Command aborted.", { exit: 1 });
    }
  }

  context.ailogic = {
    templates: local.templates,
    plan,
    // Etags from the listing let the server reject (409) writes against templates
    // that changed after planning, instead of silently overwriting the newer state.
    etags: new Map(remote.map((t) => [ailogic.templateIdFromName(t.name), t.etag])),
  };
}
