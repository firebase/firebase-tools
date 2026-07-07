import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import * as fs from "fs";
import * as path from "path";
import { confirm } from "../prompt";
import * as yaml from "js-yaml";

import { Options } from "../options";

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
    const yamlContent = parts[1];
    try {
      yaml.load(yamlContent);
    } catch (err: any) {
      return `Invalid YAML in frontmatter: ${err.message || err}`;
    }
  }
  return null;
}

export const command = new Command("ailogic:templates:deploy")
  .description("deploy server prompt templates from local files")
  .option("--dir <path>", "directory containing .prompt files", "prompts")
  .option("--prune", "delete remote templates with no matching local .prompt file")
  .before(requirePermissions, ["firebasevertexai.templates.update"])
  .action(async (options: DeployOptions) => {
    const projectId = needProjectId(options);
    const dir = options.dir ?? "prompts";

    await ailogic.ensureAILogicApiEnabled(projectId, options);

    if (!fs.existsSync(dir)) {
      if (options.dir) {
        throw new FirebaseError(`Directory does not exist: ${dir}`);
      }
      logger.info(`Default prompts directory '${dir}' does not exist. No templates to deploy.`);
      return;
    }
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) {
      throw new FirebaseError(`Path is not a directory: ${dir}`);
    }

    const files = fs.readdirSync(dir);
    const promptFiles = files.filter((f) => f.endsWith(".prompt"));

    if (promptFiles.length === 0) {
      logger.info("No .prompt files found to deploy.");
      return;
    }

    // 1. Validation pass: validate all local prompt files
    const validationErrors: { file: string; error: string }[] = [];
    const contentsMap = new Map<string, string>();
    for (const file of promptFiles) {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const err = validatePromptFile(content);
      if (err) {
        validationErrors.push({ file, error: err });
      } else {
        contentsMap.set(path.basename(file, ".prompt"), content);
      }
    }

    if (validationErrors.length > 0) {
      const msg = ["The following prompt files failed validation:"]
        .concat(validationErrors.map((e) => `  ${e.file}: ${e.error}`))
        .join("\n");
      throw new FirebaseError(msg);
    }

    // 2. Fetch remote templates and check for locks
    const remoteTemplates = await ailogic.listTemplates(projectId, "global");
    const remoteMap = new Map(remoteTemplates.map((t) => [t.name.split("/").pop()!, t]));

    const lockedTemplatesToModify: string[] = [];
    for (const file of promptFiles) {
      const templateId = path.basename(file, ".prompt");
      const remote = remoteMap.get(templateId);
      if (remote && remote.locked) {
        lockedTemplatesToModify.push(templateId);
      }
    }

    const templatesToPrune: string[] = [];
    if (options.prune) {
      for (const [id, remote] of remoteMap.entries()) {
        if (!contentsMap.has(id)) {
          if (remote.locked) {
            lockedTemplatesToModify.push(id);
          } else {
            templatesToPrune.push(id);
          }
        }
      }
    }

    if (lockedTemplatesToModify.length > 0) {
      throw new FirebaseError(
        `The following templates are locked and cannot be updated or deleted:\n\n` +
          lockedTemplatesToModify.map((id) => `  ${id}`).join("\n") +
          `\n\nUnlock them by running:\n\n  firebase ailogic:templates:unlock <templateId>\n\nThen deploy again. No templates were deployed.`,
      );
    }

    // 3. Confirm pruning if any
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

    // 4. Deploy local templates
    for (const file of promptFiles) {
      const templateId = path.basename(file, ".prompt");
      const content = contentsMap.get(templateId)!;
      const remote = remoteMap.get(templateId);

      if (remote) {
        logger.info(`Updating template ${clc.bold(templateId)}...`);
      } else {
        logger.info(`Creating template ${clc.bold(templateId)}...`);
      }

      await ailogic.updateTemplate(projectId, "global", templateId, {
        templateString: content,
        displayName: templateId,
      });
    }

    // 5. Delete pruned templates
    if (options.prune && templatesToPrune.length > 0) {
      for (const templateId of templatesToPrune) {
        logger.info(`Pruning template ${clc.bold(templateId)}...`);
        await ailogic.deleteTemplate(projectId, "global", templateId);
      }
    }

    logger.info(clc.green("Successfully deployed templates."));
  });
