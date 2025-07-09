import * as path from "path";
import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";
import { AIToolModule, AIToolConfigResult } from "./types";
import {
  replaceFirebaseFile,
  generatePromptSection,
  generateFeaturePromptSection,
} from "./promptUpdater";

const CURSOR_MCP_PATH = ".cursor/mcp.json";
const CURSOR_RULES_DIR = ".cursor/rules";

export const cursor: AIToolModule = {
  name: "cursor",
  displayName: "Cursor",

  /**
   * Configures Cursor with Firebase context files.
   *
   * - .cursor/mcp.json: Merges with existing config (preserves user settings)
   * - .cursor/rules/*.md: Fully managed by us (replaced on each update)
   *
   * We own the entire rules directory, so we can safely replace Firebase-related
   * rule files without worrying about user customizations.
   */
  async configure(
    config: Config,
    projectPath: string,
    enabledFeatures: string[],
  ): Promise<AIToolConfigResult> {
    const files: AIToolConfigResult["files"] = [];

    // Handle MCP configuration - merge with existing if present
    let mcpUpdated = false;
    let existingMcpConfig: any = {};

    try {
      const existingMcp = config.readProjectFile(CURSOR_MCP_PATH);
      if (existingMcp) {
        existingMcpConfig = JSON.parse(existingMcp);
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
        args: ["-y", "firebase-tools", "experimental:mcp", "--dir", projectPath],
      };
      config.writeProjectFile(CURSOR_MCP_PATH, JSON.stringify(existingMcpConfig, null, 2));
      mcpUpdated = true;
    }

    files.push({ path: CURSOR_MCP_PATH, updated: mcpUpdated });

    const header = readTemplateSync("init/aitools/cursor-rules-header.txt");
    const baseContent = generateFeaturePromptSection("base");
    const basePromptPath = path.join(CURSOR_RULES_DIR, "FIREBASE_BASE.md");

    const baseResult = await replaceFirebaseFile(config, basePromptPath, baseContent);
    files.push({ path: basePromptPath, updated: baseResult.updated });

    if (enabledFeatures.includes("functions")) {
      const functionsContent = generateFeaturePromptSection("functions");
      const functionsPromptPath = path.join(CURSOR_RULES_DIR, "FIREBASE_FUNCTIONS.md");

      const functionsResult = await replaceFirebaseFile(
        config,
        functionsPromptPath,
        functionsContent,
      );
      files.push({ path: functionsPromptPath, updated: functionsResult.updated });
    }

    const importContent = `# Firebase Context

@FIREBASE_BASE.md
${enabledFeatures.includes("functions") ? `@FIREBASE_FUNCTIONS.md` : ""}

`;

    const { content: mainContent } = generatePromptSection(enabledFeatures, {
      customContent: importContent,
    });
    const fullContent = header + "\n" + mainContent;
    const firebaseMDCPath = path.join(CURSOR_RULES_DIR, "FIREBASE.mdc");

    const mainResult = await replaceFirebaseFile(config, firebaseMDCPath, fullContent);
    files.push({ path: firebaseMDCPath, updated: mainResult.updated });

    return { files };
  },
};
