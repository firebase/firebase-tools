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
    // Create MCP configuration from template
    const mcpTemplate = readTemplateSync("init/aitools/cursor-mcp.json");
    const mcpConfig = mcpTemplate.replace("{{PROJECT_PATH}}", projectPath);
    config.writeProjectFile(".cursor/mcp.json", mcpConfig);

    // Handle Cursor rules file
    const rulesPath = ".cursor/rules/firebase.mdc";
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
      // Replace existing Firebase section
      newContent = replaceFirebaseSection(existingContent, firebaseContent);
      const diff = generateDiff(existingContent, newContent);

      utils.logBullet("Cursor configuration update:");
      console.log(diff);

      const shouldApply = await confirm({
        message: "Apply this change to .cursor/rules/firebase.mdc?",
        default: true,
      });

      if (!shouldApply) {
        utils.logBullet("Skipping Cursor rules update.");
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

    utils.logBullet(`✓ Cursor configuration written to:`);
    utils.logBullet(`  - .cursor/mcp.json (MCP server config)`);
    utils.logBullet(`  - .cursor/rules/firebase.mdc (AI context)`);
    if (enabledFeatures.includes("functions")) {
      utils.logBullet(`  - .cursor/rules/FIREBASE_FUNCTIONS.md (Functions context)`);
    }
  },
};
