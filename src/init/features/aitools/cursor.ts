import * as utils from "../../../utils";
import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";
import { AIToolModule } from "./types";
import { getBaseContext, getFunctionsContext } from "./context";
import {
  findFirebaseSection,
  replaceFirebaseSection,
  insertFirebaseSection,
  generateDiff,
  wrapInFirebaseTags,
} from "./configManager";
import { confirm } from "../../../prompt";

export const cursor: AIToolModule = {
  name: "cursor",
  displayName: "Cursor",

  async configure(config: Config, projectPath: string, enabledFeatures: string[]): Promise<void> {
    // Handle MCP configuration - merge with existing if present
    const mcpPath = ".cursor/mcp.json";
    let existingMcpConfig: any = {};
    let mcpUpdated = false;
    
    try {
      const existingMcp = config.readProjectFile(mcpPath);
      if (existingMcp) {
        existingMcpConfig = JSON.parse(existingMcp);
      }
    } catch (e) {
      // File doesn't exist or is invalid JSON, start fresh
    }
    
    // Check if firebase server already exists
    if (existingMcpConfig.mcpServers?.firebase) {
      utils.logLabeledBullet("Cursor", "MCP server 'firebase' already configured");
    } else {
      // Add firebase server configuration
      if (!existingMcpConfig.mcpServers) {
        existingMcpConfig.mcpServers = {};
      }
      
      existingMcpConfig.mcpServers.firebase = {
        command: "npx",
        args: ["-y", "firebase-tools", "experimental:mcp", "--dir", projectPath]
      };
      
      // Write the merged configuration
      config.writeProjectFile(mcpPath, JSON.stringify(existingMcpConfig, null, 2));
      mcpUpdated = true;
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

    // Wrap content in Firebase tags
    const firebaseContent = wrapInFirebaseTags(firebaseContext, enabledFeatures);

    // Check if we need to update existing content
    const existingSection = findFirebaseSection(existingContent);
    let newContent: string;

    if (existingSection) {
      // Check if version and features match - if so, skip update
      const currentFeatures = enabledFeatures.sort().join(",");
      const existingFeatures = (existingSection.features || []).sort().join(",");
      
      if (existingSection.version === "1.0.0" && existingFeatures === currentFeatures) {
        utils.logLabeledSuccess("Cursor", "Configuration is already up to date ✓");
        if (currentFeatures) {
          utils.logBullet(`   Optimized for: ${currentFeatures}`);
        }
        return;
      }
      
      // Version or features changed, show diff
      newContent = replaceFirebaseSection(existingContent, firebaseContent);
      const diff = generateDiff(existingContent, newContent);
      
      // Explain what changed
      if (existingFeatures !== currentFeatures) {
        console.log();
        utils.logLabeledBullet("Changes", "Firebase project configuration has changed:");
        const oldFeatures = existingSection.features || [];
        const newFeatures = enabledFeatures;
        
        const added = newFeatures.filter(f => !oldFeatures.includes(f));
        const removed = oldFeatures.filter(f => !newFeatures.includes(f));
        
        if (added.length > 0) {
          utils.logSuccess(`   + Added: ${added.join(", ")}`);
        }
        if (removed.length > 0) {
          utils.logWarning(`   - Removed: ${removed.join(", ")}`);
        }
        console.log();
      }

      utils.logLabeledBullet("Preview", "Configuration changes:");
      console.log(diff);

      const shouldApply = await confirm({
        message: "Apply this change to .cursor/rules/FIREBASE.mdc?",
        default: true,
      });

      if (!shouldApply) {
        utils.logBullet("🚫 Skipping Cursor update.");
        return;
      }
    } else if (existingContent) {
      // Append to existing file
      newContent = insertFirebaseSection(existingContent, firebaseContent);
    } else {
      // New file, add header + content
      newContent = header + "\n\n" + firebaseContent;
    }

    // Write the main rules file
    config.writeProjectFile(rulesPath, newContent);

    console.log();
    utils.logLabeledSuccess("Cursor", "Configuration written successfully!");
    utils.logBullet("📁 Files updated:");
    if (mcpUpdated) {
      utils.logBullet(`   • .cursor/mcp.json (added Firebase MCP server)`);
    }
    utils.logBullet(`   • .cursor/rules/FIREBASE.mdc (AI context rules)`);
    if (enabledFeatures.includes("functions")) {
      utils.logBullet(`   • .cursor/rules/FIREBASE_FUNCTIONS.md`);
      utils.logSuccess(`   ✓ Firebase Functions context included`);
    }
  },
};
