import * as path from "path";
import * as yaml from "js-yaml";

import { getError } from "../error";
import * as fsutils from "../fsutils";
import { Template, templateIdFromName } from "../gcp/ailogic";

export const PROMPT_FILE_EXT = ".prompt";
export const DEFAULT_PROMPTS_DIR = "prompts";

// Template ids are derived from filenames and spliced into REST resource paths,
// so restrict them to URL-safe characters. (The server may impose stricter rules.)
const TEMPLATE_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

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
    if (parsed !== undefined && parsed !== null && typeof parsed !== "object") {
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
 * Reads every prompt file in `dir`, validating ids and contents. All problems are
 * collected (not fail-fast) so the caller can report them in a single pass.
 */
export function readPromptDirectory(dir: string): LocalTemplates {
  const templates = new Map<string, string>();
  const errors: PromptFileError[] = [];

  for (const file of fsutils.listFiles(dir)) {
    // Match the extension case-insensitively so files from case-insensitive
    // filesystems (e.g. "FOO.PROMPT") are deployed rather than silently skipped.
    if (!file.toLowerCase().endsWith(PROMPT_FILE_EXT)) {
      continue;
    }
    // listFiles returns directory entries too; a directory named "foo.prompt"
    // must be reported, not read (readFile would throw a raw EISDIR).
    if (!fsutils.fileExistsSync(path.join(dir, file))) {
      errors.push({ file, error: "Not a file." });
      continue;
    }
    const templateId = file.slice(0, -PROMPT_FILE_EXT.length);
    if (!TEMPLATE_ID_REGEX.test(templateId)) {
      errors.push({
        file,
        error:
          "File name does not form a valid template id (letters, digits, '.', '_', and '-' only).",
      });
      continue;
    }
    const content = fsutils.readFile(path.join(dir, file));
    const validationError = validatePromptFile(content);
    if (validationError) {
      errors.push({ file, error: validationError });
    } else {
      templates.set(templateId, content);
    }
  }

  return { templates, errors };
}

export interface TemplateDeployPlan {
  /** Local template ids with no remote counterpart. */
  creates: string[];
  /** Local template ids that update an existing, unlocked remote template. */
  updates: string[];
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
  const plan: TemplateDeployPlan = { creates: [], updates: [], deletes: [], lockedViolations: [] };

  for (const id of local.keys()) {
    const existing = remoteById.get(id);
    if (!existing) {
      plan.creates.push(id);
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
