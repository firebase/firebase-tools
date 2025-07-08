import * as utils from "../../../utils";
import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";
import { AIToolModule } from "./types";
import { getBaseContext, getFunctionsContext, getPromptVersions } from "./context";
import {
  findFirebaseSection,
  replaceFirebaseSection,
  insertFirebaseSection,
  wrapInFirebaseTags,
} from "./configManager";
import { parseVersionsString } from "./promptVersions";

export const cursor: AIToolModule = {
  name: "cursor",
  displayName: "Cursor",

  async configure(config: Config, projectPath: string, enabledFeatures: string[]): Promise<void> {
    // Handle MCP configuration - merge with existing if present
    const mcpPath = ".cursor/mcp.json";
    let existingMcpConfig: any = {};

    try {
      const existingMcp = config.readProjectFile(mcpPath);
      if (existingMcp) {
        existingMcpConfig = JSON.parse(existingMcp);
      }
    } catch (e) {
      // File doesn't exist or is invalid JSON, start fresh
    }

    // Check if firebase server already exists
    if (!existingMcpConfig.mcpServers?.firebase) {
      // Add firebase server configuration
      if (!existingMcpConfig.mcpServers) {
        existingMcpConfig.mcpServers = {};
      }

      existingMcpConfig.mcpServers.firebase = {
        command: "npx",
        args: ["-y", "firebase-tools", "experimental:mcp", "--dir", projectPath],
      };

      // Write the merged configuration
      config.writeProjectFile(mcpPath, JSON.stringify(existingMcpConfig, null, 2));
    }

    // Handle Cursor rules file
    const rulesPath = ".cursor/rules/FIREBASE.mdc";
    let existingContent = "";

    try {
      existingContent = config.readProjectFile(rulesPath) || "";
    } catch (e) {
      // File doesn't exist yet, which is fine
    }

    // Prepare Firebase content
    const header = readTemplateSync("init/aitools/cursor-rules-header.txt");
    let firebaseContext = getBaseContext();

    // For Cursor, we reference separate files for additional contexts
    if (enabledFeatures.includes("functions")) {
      firebaseContext += "\n\n@file ./FIREBASE_FUNCTIONS.md";

      // Also write the separate functions file
      config.writeProjectFile(".cursor/rules/FIREBASE_FUNCTIONS.md", getFunctionsContext());
    }

    // Get prompt versions and wrap content in Firebase tags
    const promptVersions = getPromptVersions(enabledFeatures);
    const firebaseContent = wrapInFirebaseTags(firebaseContext, promptVersions);

    // Check if we need to update existing content
    const existingSection = findFirebaseSection(existingContent);
    let newContent: string;

    if (existingSection) {
      // Check if versions match - if so, skip update
      const existingVersions = parseVersionsString(existingSection.versions);
      const currentVersions = getPromptVersions(enabledFeatures);

      // Compare versions
      const versionsMatch = JSON.stringify(existingVersions) === JSON.stringify(currentVersions);

      if (versionsMatch) {
        return;
      }

      // Update silently
      newContent = replaceFirebaseSection(existingContent, firebaseContent);
    } else if (existingContent) {
      // Append to existing file
      newContent = insertFirebaseSection(existingContent, firebaseContent);
    } else {
      // New file, add header + content
      newContent = header + "\n\n" + firebaseContent;
    }

    // Write the main rules file
    config.writeProjectFile(rulesPath, newContent);

    utils.logSuccess("✓ Cursor configuration written to:");
    utils.logBullet("  - .cursor/mcp.json");
    utils.logBullet("  - .cursor/rules/FIREBASE.mdc");
  },
};
