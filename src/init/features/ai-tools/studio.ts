import * as utils from "../../../utils";
import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";
import { AIToolModule } from "./types";
import { getBaseContext, getFunctionsContext } from "./context";

export const studio: AIToolModule = {
  name: "studio",
  displayName: "Firebase Studio",
  
  async configure(
    config: Config,
    projectPath: string,
    enabledFeatures: string[]
  ): Promise<void> {
    // Read the Studio AI rules header template
    const header = readTemplateSync("init/ai-tools/studio-airules-header.md");
    
    // Build the Studio-specific content
    let aiRulesContent = header + "\n\nThis is a Firebase project with the following structure and conventions:\n\n";
    aiRulesContent += getBaseContext();
    
    // Add Functions-specific guidance if enabled
    if (enabledFeatures.includes("functions")) {
      aiRulesContent += "\n\n## Firebase Functions Guidelines\n\n";
      aiRulesContent += getFunctionsContext();
    }
    
    // Write the AI rules file
    config.writeProjectFile(".idx/airules.md", aiRulesContent);

    utils.logBullet(`✓ Firebase Studio configuration written to:`);
    utils.logBullet(`  - .idx/airules.md (AI rules)`);
    utils.logBullet(`  - Refresh your Firebase Studio workspace to load new rules`);
  }
};