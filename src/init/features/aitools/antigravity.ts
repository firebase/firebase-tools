import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Config } from "../../../config";
import { AIToolModule, AIToolConfigResult } from "./types";

interface McpConfig {
  mcpServers?: Record<
    string,
    {
      command: string;
      args: string[];
      env?: Record<string, string>;
    }
  >;
}

// Constants for paths that might need dynamic resolution
const GEMINI_DIR = path.join(os.homedir(), ".gemini");
const ANTIGRAVITY_DIR_NAME = "antigravity";
const JETSKI_DIR_NAME = "jetski";

function getAntigravityDir(): string {
  const antigravityPath = path.join(GEMINI_DIR, ANTIGRAVITY_DIR_NAME);
  const jetskiPath = path.join(GEMINI_DIR, JETSKI_DIR_NAME);

  if (fs.existsSync(antigravityPath)) {
    return antigravityPath;
  }
  if (fs.existsSync(jetskiPath)) {
    return jetskiPath;
  }
  return antigravityPath;
}

export const antigravity: AIToolModule = {
  name: "antigravity",
  displayName: "Google Antigravity",

  /**
   * Configures Google Antigravity with Firebase context.
   *
   * This function sets up the necessary files for Antigravity to interact with the Firebase CLI.
   * It creates or updates `~/.gemini/antigravity/mcp_config.json` (or `~/.gemini/jetski/mcp_config.json`).
   */
  async configure(config: Config, projectPath: string): Promise<AIToolConfigResult> {
    const files: AIToolConfigResult["files"] = [];
    let mcpUpdated = false;
    let existingMcpConfig: McpConfig = {};

    const baseDir = getAntigravityDir();
    const mcpConfigPath = path.join(baseDir, "mcp_config.json");

    // Ensure directory exists
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    try {
      if (fs.existsSync(mcpConfigPath)) {
        const content = fs.readFileSync(mcpConfigPath, "utf-8");
        existingMcpConfig = JSON.parse(content) as McpConfig;
      }
    } catch (e) {
      // File doesn't exist or is invalid JSON, start fresh
    }

    if (!existingMcpConfig.mcpServers?.firebase) {
      if (!existingMcpConfig.mcpServers) {
        existingMcpConfig.mcpServers = {};
      }
      existingMcpConfig.mcpServers.firebase = {
        command: "npx",
        args: ["-y", "firebase-tools", "mcp", "--dir", projectPath],
      };

      fs.writeFileSync(mcpConfigPath, JSON.stringify(existingMcpConfig, null, 2));
      mcpUpdated = true;
    }

    files.push({ path: mcpConfigPath, updated: mcpUpdated });

    return { files };
  },

  getSkillPath(): string {
    return path.join(getAntigravityDir(), "skills");
  },
};
