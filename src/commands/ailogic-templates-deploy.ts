import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import * as utils from "../utils";
import { logger } from "../logger";
import { FirebaseError, getError } from "../error";
import * as fsutils from "../fsutils";
import * as path from "path";
import { confirm } from "../prompt";
import * as yaml from "js-yaml";

import { Options } from "../options";

const PROMPT_FILE_EXT = ".prompt";
const DEFAULT_PROMPTS_DIR = "prompts";

interface DeployOptions extends Options {
  dir?: string;
  prune?: boolean;
}

function validatePromptFile(content: string): string | null {
  if (!content.trim()) {
    return "File is empty.";
  }
  if (content.startsWith("---")) {
    const parts = content.split("---");
    if (parts.length < 3) {
      return "Frontmatter block is not closed (missing terminating '---').";
    }
    try {
      yaml.load(parts[1]);
    } catch (err: unknown) {
      return `Invalid YAML in frontmatter: ${getError(err).message}`;
    }
  }
  return null;
}

export const command = new Command("ailogic:templates:deploy")
  .description("deploy server prompt templates from local files")
  .option(
    "--dir <path>",
    `directory containing ${PROMPT_FILE_EXT} files (default: ${DEFAULT_PROMPTS_DIR})`,
  )
  .option("--prune", "delete remote templates with no matching local .prompt file")
  .before(requirePermissions, ["firebasevertexai.templates.update"])
  .action(async (options: DeployOptions) => {
    const projectId = needProjectId(options);
    // `--dir` has no Commander default so we can tell an explicit `--dir` apart from
    // the implicit default: an explicit missing directory is an error, whereas a
    // missing default directory is a no-op.
    const dirExplicit = typeof options.dir === "string";
    const dir = options.dir ?? DEFAULT_PROMPTS_DIR;

    await ailogic.ensureAILogicApiEnabled(projectId, options);

    if (!fsutils.dirExistsSync(dir)) {
      if (dirExplicit) {
        throw new FirebaseError(`Directory does not exist: ${dir}`);
      }
      logger.info(`Default prompts directory '${dir}' does not exist. No templates to deploy.`);
      return;
    }

    const promptFiles = fsutils.listFiles(dir).filter((f) => f.endsWith(PROMPT_FILE_EXT));
    if (promptFiles.length === 0) {
      logger.info(`No ${PROMPT_FILE_EXT} files found to deploy.`);
      return;
    }

    // 1. Validation pass: validate every local prompt file and report all failures at once.
    const validationErrors: { file: string; error: string }[] = [];
    const contentsMap = new Map<string, string>();
    for (const file of promptFiles) {
      const content = fsutils.readFile(path.join(dir, file));
      const err = validatePromptFile(content);
      if (err) {
        validationErrors.push({ file, error: err });
      } else {
        contentsMap.set(path.basename(file, PROMPT_FILE_EXT), content);
      }
    }

    if (validationErrors.length > 0) {
      throw new FirebaseError(
        ["The following prompt files failed validation:"]
          .concat(validationErrors.map((e) => `  ${e.file}: ${e.error}`))
          .join("\n"),
      );
    }

    // 2. Fetch remote templates and check for locks.
    const remoteTemplates = await ailogic.listTemplates(projectId, ailogic.GLOBAL_LOCATION);
    const remoteMap = new Map(remoteTemplates.map((t) => [ailogic.templateIdFromName(t.name), t]));

    const lockedTemplatesToModify: string[] = [];
    for (const templateId of contentsMap.keys()) {
      if (remoteMap.get(templateId)?.locked) {
        lockedTemplatesToModify.push(templateId);
      }
    }

    const templatesToPrune: string[] = [];
    if (options.prune) {
      for (const [id, remote] of remoteMap.entries()) {
        if (!contentsMap.has(id)) {
          (remote.locked ? lockedTemplatesToModify : templatesToPrune).push(id);
        }
      }
    }

    // Locked templates block the whole deploy during validation; --force does not override a lock.
    if (lockedTemplatesToModify.length > 0) {
      throw new FirebaseError(
        `The following templates are locked and cannot be updated or deleted:\n\n` +
          lockedTemplatesToModify.map((id) => `  ${id}`).join("\n") +
          `\n\nUnlock them by running:\n\n  firebase ailogic:templates:unlock <templateId>\n\nThen deploy again. No templates were deployed.`,
      );
    }

    // 3. Confirm pruning. confirm() aborts in non-interactive mode unless --force is set.
    if (options.prune && templatesToPrune.length > 0) {
      const confirmed = await confirm({
        message:
          `This will delete the following remote templates that do not exist locally:\n\n` +
          templatesToPrune.map((id) => `  ${id}`).join("\n") +
          `\n\nAre you sure you want to proceed?`,
        force: options.force,
        nonInteractive: options.nonInteractive,
      });
      if (!confirmed) {
        throw new FirebaseError("Command aborted.", { exit: 1 });
      }
    }

    // 4. Deploy local templates.
    for (const [templateId, content] of contentsMap.entries()) {
      const verb = remoteMap.has(templateId) ? "Updating" : "Creating";
      logger.info(`${verb} template ${clc.bold(templateId)}...`);
      await ailogic.updateTemplate(projectId, ailogic.GLOBAL_LOCATION, templateId, {
        templateString: content,
        displayName: templateId,
      });
    }

    // 5. Delete pruned templates.
    for (const templateId of templatesToPrune) {
      logger.info(`Pruning template ${clc.bold(templateId)}...`);
      await ailogic.deleteTemplate(projectId, ailogic.GLOBAL_LOCATION, templateId);
    }

    utils.logSuccess("Successfully deployed templates.");
  });
