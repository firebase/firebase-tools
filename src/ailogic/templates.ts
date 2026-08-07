import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

import { getError } from "../error";
import * as fsutils from "../fsutils";
import { Template, templateIdFromName, TEMPLATE_ID_REGEX } from "../gcp/ailogic";

export const PROMPT_FILE_EXT = ".prompt";
export const DEFAULT_PROMPTS_DIR = "prompts";

// Frontmatter is delimited by `---` on its own line; matching anchored lines
// (rather than splitting on "---" anywhere) keeps `---` inside YAML values or
// the prompt body from being mistaken for a delimiter.
const FRONTMATTER_OPEN = /^---[^\S\r\n]*(\r?\n|$)/;
const FRONTMATTER_CLOSE = /(^|\r?\n)---[^\S\r\n]*(\r?\n|$)/;

/**
 * Validates one prompt file's content, returning an error message or null when valid.
 */
export function validatePromptFile(content: string): string | null {
  if (!content.trim()) {
    return "File is empty.";
  }
  if (!FRONTMATTER_OPEN.test(content)) {
    return null; // No frontmatter; the whole file is the prompt body.
  }
  const rest = content.replace(FRONTMATTER_OPEN, "");
  const close = FRONTMATTER_CLOSE.exec(rest);
  if (!close) {
    return "Frontmatter block is not closed (missing terminating '---').";
  }
  const frontmatter = rest.slice(0, close.index);
  try {
    const parsed = yaml.load(frontmatter);
    // Arrays are typeof "object" too; a YAML sequence is not a valid mapping.
    if (
      parsed !== undefined &&
      parsed !== null &&
      (typeof parsed !== "object" || Array.isArray(parsed))
    ) {
      return "Frontmatter must be a YAML mapping.";
    }
  } catch (err: unknown) {
    return `Invalid YAML in frontmatter: ${getError(err).message}`;
  }
  return null;
}

export interface PromptFileError {
  file: string;
  error: string;
}

export interface LocalTemplates {
  /** Template id (filename without the extension) mapped to the file's content. */
  templates: Map<string, string>;
  /** Every invalid prompt file, so problems can be reported in one pass. */
  errors: PromptFileError[];
}

/**
 * Reads every prompt file under `dir` (recursively), validating ids and contents.
 * All problems are collected (not fail-fast) so the caller can report them in a
 * single pass.
 *
 * Template ids must be a single URL segment, so a nested file's relative path
 * flattens into its id with `/` becoming `.`: agents/support.prompt -> agents.support.
 */
export function readPromptDirectory(dir: string): LocalTemplates {
  const templates = new Map<string, string>();
  // Which file produced each id, so a collision can name both offenders.
  const sourceOfId = new Map<string, string>();
  const errors: PromptFileError[] = [];

  const walk = (rel: string): void => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      // Ids and error messages use `/` regardless of platform.
      const file = rel ? `${rel}/${entry.name}` : entry.name;
      // Match the extension case-insensitively so files from case-insensitive
      // filesystems (e.g. "FOO.PROMPT") are deployed rather than silently skipped.
      const hasPromptExt = entry.name.toLowerCase().endsWith(PROMPT_FILE_EXT);
      if (entry.isDirectory()) {
        if (hasPromptExt) {
          // A directory named "foo.prompt" is almost certainly a mistake; report
          // it rather than silently recursing into or skipping it.
          errors.push({ file, error: "Not a file." });
        } else {
          walk(file);
        }
        continue;
      }
      if (!hasPromptExt) {
        continue;
      }
      const templateId = file.slice(0, -PROMPT_FILE_EXT.length).replace(/\//g, ".");
      if (!TEMPLATE_ID_REGEX.test(templateId)) {
        errors.push({
          file,
          error:
            "File path does not form a valid template id (letters, digits, '.', '_', and '-' only).",
        });
        continue;
      }
      if (templates.has(templateId)) {
        errors.push({
          file,
          error: `Duplicate template id '${templateId}' (also from ${sourceOfId.get(templateId)}).`,
        });
        continue;
      }
      const content = fsutils.readFile(path.join(dir, file));
      const validationError = validatePromptFile(content);
      if (validationError) {
        errors.push({ file, error: validationError });
      } else {
        templates.set(templateId, content);
        sourceOfId.set(templateId, file);
      }
    }
  };
  walk("");

  return { templates, errors };
}

export interface TemplateDeployPlan {
  /** Local template ids with no remote counterpart. */
  creates: string[];
  /** Local template ids that update an existing, unlocked remote template. */
  updates: string[];
  /** Local template ids whose content already matches the remote; nothing to write. */
  unchanged: string[];
  /** Remote template ids to prune (unlocked, no local counterpart). */
  deletes: string[];
  /** Locked templates the deploy would modify or delete; any entry blocks the deploy. */
  lockedViolations: string[];
}

/**
 * Computes what a deploy would change, given the local templates and the remote
 * state. Pure function: no I/O, so the set arithmetic is directly unit-testable
 * (mirroring the functions release planner).
 */
export function planTemplateDeploy(
  local: Map<string, string>,
  remote: Template[],
  prune: boolean,
): TemplateDeployPlan {
  const remoteById = new Map(remote.map((t) => [templateIdFromName(t.name), t]));
  const plan: TemplateDeployPlan = {
    creates: [],
    updates: [],
    unchanged: [],
    deletes: [],
    lockedViolations: [],
  };

  for (const [id, content] of local) {
    const existing = remoteById.get(id);
    if (!existing) {
      plan.creates.push(id);
    } else if (existing.templateString === content) {
      // Nothing to write, so a lock on an identical template is not violated
      // and an unchanged deploy does not churn updateTime/etag.
      plan.unchanged.push(id);
    } else if (existing.locked) {
      plan.lockedViolations.push(id);
    } else {
      plan.updates.push(id);
    }
  }

  if (prune) {
    for (const [id, remoteTemplate] of remoteById) {
      if (!local.has(id)) {
        (remoteTemplate.locked ? plan.lockedViolations : plan.deletes).push(id);
      }
    }
  }

  return plan;
}
