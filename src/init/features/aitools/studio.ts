import * as utils from "../../../utils";
import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";
import { AIToolModule } from "./types";
import { getBaseContext, getFunctionsContext } from "./context";
import { 
  wrapInFirebaseTags, 
  findFirebaseSection, 
  replaceFirebaseSection, 
  insertFirebaseSection,
  generateDiff 
} from "./configManager";
import { confirm } from "../../../prompt";

export const studio: AIToolModule = {
  name: "studio",
  displayName: "Firebase Studio",

  async configure(config: Config, projectPath: string, enabledFeatures: string[]): Promise<void> {
    // Also create MCP configuration for Studio
    const mcpTemplate = readTemplateSync("init/aitools/cursor-mcp.json");
    const mcpConfig = mcpTemplate.replace("{{PROJECT_PATH}}", projectPath);
    config.writeProjectFile(".idx/mcp.json", mcpConfig);

    // Handle AI rules file
    const rulesPath = ".idx/airules.md";
    let existingContent = "";
    
    try {
      existingContent = config.readProjectFile(rulesPath) || "";
    } catch (e) {
      // File doesn't exist yet, which is fine
    }

    // Read the Studio AI rules header template
    const header = readTemplateSync("init/aitools/studio-airules-header.md");

    // Build the Studio-specific content
    let firebaseContext = "This is a Firebase project with the following structure and conventions:\n\n";
    firebaseContext += getBaseContext();

    // Add Functions-specific guidance if enabled
    if (enabledFeatures.includes("functions")) {
      firebaseContext += "\n\n## Firebase Functions Guidelines\n\n";
      firebaseContext += getFunctionsContext();
    }

    // Wrap in Firebase tags
    const firebaseContent = wrapInFirebaseTags(firebaseContext, enabledFeatures);
    
    // Check if we need to update existing content
    const existingSection = findFirebaseSection(existingContent);
    let newContent: string;
    
    if (existingSection) {
      // Replace existing Firebase section
      newContent = replaceFirebaseSection(existingContent, firebaseContent);
      const diff = generateDiff(existingContent, newContent);
      
      utils.logBullet("Firebase Studio configuration update:");
      console.log(diff);
      
      const shouldApply = await confirm({
        message: "Apply this change to .idx/airules.md?",
        default: true,
      });
      
      if (!shouldApply) {
        utils.logBullet("Skipping Firebase Studio update.");
        return;
      }
    } else if (existingContent) {
      // Append to existing file
      newContent = insertFirebaseSection(existingContent, firebaseContent);
    } else {
      // New file, add header + content
      newContent = header + "\n\n" + firebaseContent;
    }

    // Write the AI rules file
    config.writeProjectFile(rulesPath, newContent);

    utils.logBullet(`✓ Firebase Studio configuration written to:`);
    utils.logBullet(`  - .idx/mcp.json (MCP server config)`);
    utils.logBullet(`  - .idx/airules.md (AI rules)`);
    utils.logBullet(`  - Refresh your Firebase Studio workspace to load new rules`);
  },
};
