import * as utils from "../../../utils";
import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";
import { AIToolModule } from "./types";
import { getBaseContext, getFunctionsContext } from "./context";

export const cursor: AIToolModule = {
  name: "cursor",
  displayName: "Cursor",
  
  async configure(
    config: Config,
    projectPath: string,
    enabledFeatures: string[]
  ): Promise<void> {
    // Create MCP configuration from template
    const mcpTemplate = readTemplateSync("init/ai-tools/cursor-mcp.json");
    const mcpConfig = mcpTemplate.replace("{{PROJECT_PATH}}", projectPath);
    config.writeProjectFile(".cursor/mcp.json", mcpConfig);

    // Create Cursor rules file with proper header
    const header = readTemplateSync("init/ai-tools/cursor-rules-header.txt");
    let rulesContent = header + "\n\n" + getBaseContext();
    
    // For Cursor, we reference separate files for additional contexts
    if (enabledFeatures.includes("functions")) {
      rulesContent += "\n\n@file ./FIREBASE_FUNCTIONS.md";
      
      // Also write the separate functions file
      config.writeProjectFile(".cursor/rules/FIREBASE_FUNCTIONS.md", getFunctionsContext());
    }
    
    // Write the main rules file
    config.writeProjectFile(".cursor/rules/firebase.mdc", rulesContent);

    utils.logBullet(`✓ Cursor configuration written to:`);
    utils.logBullet(`  - .cursor/mcp.json (MCP server config)`);
    utils.logBullet(`  - .cursor/rules/firebase.mdc (AI context)`);
    if (enabledFeatures.includes("functions")) {
      utils.logBullet(`  - .cursor/rules/FIREBASE_FUNCTIONS.md (Functions context)`);
    }
  }
};