import { dirExistsSync } from "./fsutils";

let googleIdxFolderExists: boolean | undefined;
export function isFirebaseStudio() {
  if (googleIdxFolderExists === true || process.env.MONOSPACE_ENV) return true;
  if (googleIdxFolderExists === false) return false;
  googleIdxFolderExists = dirExistsSync("/google/idx");
  return googleIdxFolderExists;
}

let isFirebaseMcpFlag = false;
export function isFirebaseMcp() {
  return isFirebaseMcpFlag;
}

export function setFirebaseMcp(value: boolean) {
  isFirebaseMcpFlag = value;
}
export const ANTIGRAVITY = "antigravity" as const;
export const CLAUDE_CODE_COWORK = "claude_code_cowork" as const;
export const CLAUDE_CODE = "claude_code" as const;
export const CLINE = "cline" as const;
export const CODEX_CLI = "codex_cli" as const;
export const CURSOR = "cursor" as const;
export const GEMINI_CLI = "gemini_cli" as const;
export const OPEN_CODE = "open_code" as const;
export const REPLIT = "replit" as const;
export const COPILOT = "copilot" as const;
export const GOOGLE_AI_STUDIO = "google_ai_studio" as const;
export const UNKNOWN = "unknown" as const;

/** All possible AI Agents */
export type AiAgents =
  | typeof ANTIGRAVITY
  | typeof CLAUDE_CODE_COWORK
  | typeof CLAUDE_CODE
  | typeof CLINE
  | typeof CODEX_CLI
  | typeof CURSOR
  | typeof GEMINI_CLI
  | typeof GOOGLE_AI_STUDIO
  | typeof OPEN_CODE
  | typeof REPLIT
  | typeof COPILOT
  | typeof UNKNOWN;

/**
 * Detect if the CLI was invoked by a coding agent, based on well-known env vars.  Returns "unknown" if the coding agent is undefined, or if the environment is not running in a coding agent.
 * @returns The AI agent that invoked the CLI, or UNKNOWN if none.
 */
export function detectAIAgent(): AiAgents {
  if (process.env["ANTIGRAVITY_CLI_ALIAS"]) return ANTIGRAVITY;
  if (process.env["CLAUDECODE"]) {
    return process.env["CLAUDE_CODE_IS_COWORK"] ? CLAUDE_CODE_COWORK : CLAUDE_CODE;
  }
  if (process.env["CLINE_ACTIVE"]) return CLINE;
  if (process.env["CODEX_SANDBOX"]) return CODEX_CLI;
  if (
    process.env["CURSOR_AGENT"] ||
    process.env["CURSOR_TRACE_ID"] ||
    process.env["CODEX_THREAD_ID"] ||
    process.env["CODEX_SANDBOX_NETWORK_DISABLED"]
  )
    return CURSOR;
  if (process.env["GEMINI_CLI"]) return GEMINI_CLI;
  if (process.env["OPENCODE"] || process.env["OPENCODE_CLIENT"]) return OPEN_CODE;
  if (process.env["REPLIT_USER"] || process.env["REPL_ID"]) return REPLIT;
  if (process.env["COPILOT_MODEL"]) return COPILOT;
  if (process.env["APPLET_DIR"]) return GOOGLE_AI_STUDIO;
  return UNKNOWN;
}
