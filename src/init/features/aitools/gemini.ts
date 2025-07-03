import * as utils from "../../../utils";
import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";
import { AIToolModule } from "./types";
import { getCombinedContext } from "./context";
import { 
  wrapInFirebaseTags, 
  findFirebaseSection, 
  replaceFirebaseSection, 
  generateDiff 
} from "./configManager";
import { confirm } from "../../../prompt";

export const gemini: AIToolModule = {
  name: "gemini",
  displayName: "Gemini CLI",

  async configure(config: Config, projectPath: string, enabledFeatures: string[]): Promise<void> {
    // Create extension configuration from template
    const extensionTemplate = readTemplateSync("init/aitools/gemini-extension.json");
    const extensionConfig = extensionTemplate.replace("{{PROJECT_PATH}}", projectPath);
    config.writeProjectFile(".gemini/extensions/firebase/gemini-extension.json", extensionConfig);

    // Handle context file with diff preview
    const contextPath = ".gemini/extensions/firebase/FIREBASE.md";
    let existingContent = "";
    
    try {
      existingContent = config.readProjectFile(contextPath) || "";
    } catch (e) {
      // File doesn't exist yet, which is fine
    }

    // Prepare new content
    const combinedContext = getCombinedContext(enabledFeatures);
    const wrappedContext = wrapInFirebaseTags(combinedContext, enabledFeatures);
    
    // Check if we need to show diff
    if (existingContent) {
      const existingSection = findFirebaseSection(existingContent);
      if (existingSection) {
        const newContent = replaceFirebaseSection(existingContent, wrappedContext);
        const diff = generateDiff(existingContent, newContent);
        
        utils.logBullet("Gemini CLI configuration update:");
        console.log(diff);
        
        const shouldApply = await confirm({
          message: "Apply this change to .gemini/extensions/firebase/FIREBASE.md?",
          default: true,
        });
        
        if (!shouldApply) {
          utils.logBullet("Skipping Gemini CLI update.");
          return;
        }
        
        config.writeProjectFile(contextPath, newContent);
      } else {
        // No Firebase section found, just overwrite (Gemini uses extension mechanism)
        config.writeProjectFile(contextPath, wrappedContext);
      }
    } else {
      // New file
      config.writeProjectFile(contextPath, wrappedContext);
    }

    utils.logBullet(`✓ Gemini CLI extension created at:`);
    utils.logBullet(`  - .gemini/extensions/firebase/`);
    utils.logBullet(`  - Context includes: FIREBASE.md`);
    if (enabledFeatures.includes("functions")) {
      utils.logBullet(`  - With Firebase Functions context included`);
    }
  },
};
