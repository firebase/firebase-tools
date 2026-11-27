import { Config } from "../../../config";
import { AIToolModule, AIToolConfigResult } from "./types";
import { updateFirebaseSection } from "./promptUpdater";

const MCP_CONFIG_PATH = ".mcp.json";
const CLAUDE_PROMPT_PATH = "CLAUDE.md";

export const claude: AIToolModule = {
  name: "claude",
  displayName: "Claude Code",

  /**
   * Configures Claude Code with Firebase context.
   *
   * - .mcp.json: Merges with existing MCP server config (preserves user settings)
   * - CLAUDE.md: Updates Firebase section only (preserves user content)
   */
  async configure(
    config: Config,
    projectPath: string,
    enabledFeatures: string[],
  ): Promise<AIToolConfigResult> {
    const files: AIToolConfigResult["files"] = [];

    // Handle MCP configuration in .mcp.json - merge with existing if present
    let existingConfig: { mcpServers?: Record<string, { command: string; args: string[] }> } = {};
    let mcpUpdated = false;
    try {
      const existingContent = config.readProjectFile(MCP_CONFIG_PATH);
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
        args: ["-y", "firebase-tools", "mcp", "--dir", projectPath],
      };
      config.writeProjectFile(MCP_CONFIG_PATH, JSON.stringify(existingConfig, null, 2));
      mcpUpdated = true;
    }

    files.push({ path: MCP_CONFIG_PATH, updated: mcpUpdated });

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
