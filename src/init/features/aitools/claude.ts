import { Config } from "../../../config";
import { AIToolModule, AIToolConfigResult } from "./types";
import { updateFirebaseSection } from "./promptUpdater";

const CLAUDE_SETTINGS_PATH = ".claude/settings.local.json";
const CLAUDE_PROMPT_PATH = "CLAUDE.local.md";

export const claude: AIToolModule = {
  name: "claude",
  displayName: "Claude Code",

  /**
   * Configures Claude Code with Firebase context.
   *
   * - .claude/settings.local.json: Merges with existing config (preserves user settings)
   * - CLAUDE.local.md: Updates Firebase section only (preserves user content)
   */
  async configure(
    config: Config,
    projectPath: string,
    enabledFeatures: string[],
  ): Promise<AIToolConfigResult> {
    const files: AIToolConfigResult["files"] = [];

    // Handle MCP configuration - merge with existing if present
    let existingConfig: any = {};
    let settingsUpdated = false;
    try {
      const existingContent = config.readProjectFile(CLAUDE_SETTINGS_PATH);
      if (existingContent) {
        existingConfig = JSON.parse(existingContent);
      }
    } catch (e) {
      // File doesn't exist or is invalid JSON, start fresh
    }

    // Check if firebase server already exists
    if (!existingConfig.mcpServers?.firebase) {
      if (!existingConfig.mcpServers) {
        existingConfig.mcpServers = {};
      }
      existingConfig.mcpServers.firebase = {
        command: "npx",
        args: ["-y", "firebase-tools", "experimental:mcp", "--dir", projectPath],
      };
      config.writeProjectFile(CLAUDE_SETTINGS_PATH, JSON.stringify(existingConfig, null, 2));
      settingsUpdated = true;
    }

    files.push({ path: CLAUDE_SETTINGS_PATH, updated: settingsUpdated });

    const { updated } = await updateFirebaseSection(config, CLAUDE_PROMPT_PATH, enabledFeatures, {
      interactive: true,
    });

    files.push({
      path: CLAUDE_PROMPT_PATH,
      updated,
    });

    return { files };
  },
};
