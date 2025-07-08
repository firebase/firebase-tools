import * as utils from "../../../utils";
import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";
import { AIToolModule } from "./types";
import { getBaseContext, getFunctionsContext, getPromptVersions } from "./context";
import { findFirebaseSection, replaceFirebaseSection, wrapInFirebaseTags } from "./configManager";
import { parseVersionsString } from "./promptVersions";

export const gemini: AIToolModule = {
  name: "gemini",
  displayName: "Gemini CLI",

  async configure(config: Config, projectPath: string, enabledFeatures: string[]): Promise<void> {
    // Create extension configuration from template
    const extensionTemplate = readTemplateSync("init/aitools/gemini-extension.json");
    const extensionConfig = extensionTemplate.replace("{{PROJECT_PATH}}", projectPath);
    config.writeProjectFile(".gemini/extensions/firebase/gemini-extension.json", extensionConfig);

    // Create modular context files using memory import processor
    const baseDir = ".gemini/extensions/firebase";

    // Write base Firebase context
    const baseContext = getBaseContext();
    config.writeProjectFile(`${baseDir}/contexts/firebase-base.md`, baseContext);

    // Write functions context if enabled
    if (enabledFeatures.includes("functions")) {
      const functionsContext = getFunctionsContext();
      config.writeProjectFile(`${baseDir}/contexts/firebase-functions.md`, functionsContext);
    }

    // Get current prompt versions
    const promptVersions = getPromptVersions(enabledFeatures);
    
    // Create main FIREBASE.md with imports
    const mainContent = wrapInFirebaseTags(`
# Firebase Context

<!-- Import base Firebase context -->
@./contexts/firebase-base.md
${enabledFeatures.includes("functions") ? `
<!-- Import Firebase Functions context -->
@./contexts/firebase-functions.md` : ''}
`, promptVersions);

    // Handle existing content with diff preview
    const contextPath = `${baseDir}/FIREBASE.md`;
    let existingContent = "";

    try {
      existingContent = config.readProjectFile(contextPath) || "";
    } catch (e) {
      // File doesn't exist yet, which is fine
    }

    // Check if we need to show diff
    if (existingContent) {
      const existingSection = findFirebaseSection(existingContent);
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
        const newContent = replaceFirebaseSection(existingContent, mainContent);
        config.writeProjectFile(contextPath, newContent);
      } else {
        // No Firebase section found, just overwrite
        config.writeProjectFile(contextPath, mainContent);
      }
    } else {
      // New file
      config.writeProjectFile(contextPath, mainContent);
    }

    utils.logSuccess("✓ Gemini CLI extension for Firebase created at:");
    utils.logBullet("  - .gemini/extensions/firebase/gemini-extension.json");
  },
};
