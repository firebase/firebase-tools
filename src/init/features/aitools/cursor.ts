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
const CURSOR_SKILLS_DIR = "~/.cursor/skills";

export const cursor: AIToolModule = {
  name: "cursor",
  displayName: "Cursor",

  /**
   * Configures Cursor with Firebase context files.
   *
   * This function sets up the necessary files for Cursor to understand the
   * Firebase project structure and interact with the Firebase CLI. It creates
   * a `.cursor` directory with the following:
   *
   * - `mcp.json`: Configures the Firebase MCP server for direct Firebase operations from Cursor.
   * - `rules/FIREBASE.mdc`: The main entry point for project-specific context, importing other rule files.
   * - `rules/FIREBASE_BASE.md`: Contains fundamental details about the Firebase project.
   * - `rules/FIREBASE_FUNCTIONS.md`: (Optional) Contains information about Cloud Functions if the feature is enabled.
   *
   * File ownership:
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

    // Handle MCP configuration - merge with existing if present.
    // This allows Cursor to communicate with the Firebase CLI.
    let mcpUpdated = false;
    let existingMcpConfig: any = {};

    try {
      const existingMcp = config.readProjectFile(CURSOR_MCP_PATH);
      if (existingMcp) {
        existingMcpConfig = JSON.parse(existingMcp) as any;
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
      config.writeProjectFile(CURSOR_MCP_PATH, JSON.stringify(existingMcpConfig, null, 2));
      mcpUpdated = true;
    }

    files.push({ path: CURSOR_MCP_PATH, updated: mcpUpdated });

    const header = readTemplateSync("init/aitools/cursor-rules-header.txt");

    // Create the base Firebase context file (FIREBASE_BASE.md).
    // This file contains fundamental details about the Firebase project.
    const baseContent = generateFeaturePromptSection("base");
    const basePromptPath = path.join(CURSOR_RULES_DIR, "FIREBASE_BASE.md");

    const baseResult = await replaceFirebaseFile(config, basePromptPath, baseContent);
    files.push({ path: basePromptPath, updated: baseResult.updated });

    // If Functions are enabled, create the Functions-specific context file.
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

    // Create the main `FIREBASE.mdc` file, which acts as an entry point
    // for Cursor's AI and imports the other context files.
    const imports = ["@FIREBASE_BASE.md"];
    if (enabledFeatures.includes("functions")) {
      imports.push("@FIREBASE_FUNCTIONS.md");
    }
    const importContent = `# Firebase Context\n\n${imports.join("\n")}\n`;

    const { content: mainContent } = generatePromptSection(enabledFeatures, {
      customContent: importContent,
    });
    const fullContent = header + "\n" + mainContent;
    const firebaseMDCPath = path.join(CURSOR_RULES_DIR, "FIREBASE.mdc");

    const mainResult = await replaceFirebaseFile(config, firebaseMDCPath, fullContent);
    files.push({ path: firebaseMDCPath, updated: mainResult.updated });

    return { files };
    return { files };
  },

  getSkillPath(): string {
    return CURSOR_SKILLS_DIR;
  },
};
