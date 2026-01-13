import { dirExistsSync } from "./fsutils";

let googleIdxFolderExists: boolean | undefined;
export function isFirebaseStudio() {
  if (googleIdxFolderExists === true || process.env.MONOSPACE_ENV) return true;
  if (googleIdxFolderExists === false) return false;
  googleIdxFolderExists = dirExistsSync("/google/idx");
  return googleIdxFolderExists;
}

export function isFirebaseMcp() {
  return !!process.env.IS_FIREBASE_MCP;
}

// Detect if the CLI was invoked by a coding agent, based on well-known env vars.
export function detectAIAgent(): string {
  if (process.env.ANTIGRAVITY_CLI_ALIAS) return "antigravity";
  if (process.env.CLAUDECODE) return "claude_code";
  if (process.env.CLINE_ACTIVE) return "cline";
  if (process.env.CODEX_SANDBOX) return "codex_cli";
  if (process.env.CURSOR_AGENT) return "cursor";
  if (process.env.GEMINI_CLI) return "gemini_cli";
  if (process.env.OPENCODE) return "open_code";
  return "unknown";
}
