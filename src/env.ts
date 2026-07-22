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
  return isFirebaseMcpFlag || process.env.IS_FIREBASE_MCP === "true";
}

export function setFirebaseMcp(value: boolean) {
  isFirebaseMcpFlag = value;
  if (value) {
    process.env.IS_FIREBASE_MCP = "true";
  } else {
    delete process.env.IS_FIREBASE_MCP;
  }
}

// Detect if the CLI was invoked by a coding agent, based on well-known env vars.
// Standardized standard (AI_AGENT) is checked first to allow universal override.
// See: https://github.com/vercel/vercel/tree/main/packages/detect-agent
export function detectAIAgent(): string {
  // 1. Standardized standard
  const aiAgent = process.env.AI_AGENT?.trim();
  if (aiAgent) {
    return aiAgent;
  }

  // 2. Specific agents (ordered as requested)
  // Antigravity
  if (process.env.ANTIGRAVITY_AGENT) return "antigravity";

  // Claude Code
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE) return "claude_code";

  // Cline
  if (process.env.CLINE_ACTIVE) return "cline";

  // Codex
  if (process.env.CODEX_SANDBOX || process.env.CODEX_CI || process.env.CODEX_THREAD_ID) {
    return "codex_cli";
  }

  // Cursor
  if (
    process.env.CURSOR_AGENT ||
    process.env.CURSOR_TRACE_ID ||
    process.env.CURSOR_EXTENSION_HOST_ROLE === "agent-exec"
  ) {
    return "cursor";
  }

  // Gemini CLI
  if (process.env.GEMINI_CLI) return "gemini_cli";

  // OpenCode
  if (process.env.OPENCODE || process.env.OPENCODE_CLIENT) return "open_code";

  // Android Studio Agent
  if (process.env.ANDROID_STUDIO_AGENT) return "android_studio_agent";

  // Kiro
  if (process.env.KIRO_AGENT_PATH) return "kiro";

  // 3. All others
  // GitHub Copilot
  if (
    process.env.COPILOT_MODEL ||
    process.env.COPILOT_ALLOW_ALL ||
    process.env.COPILOT_GITHUB_TOKEN
  ) {
    return "github_copilot";
  }

  // Replit
  if (process.env.REPL_ID) return "replit";

  // Augment
  if (process.env.AUGMENT_AGENT) return "augment";

  return "unknown";
}
