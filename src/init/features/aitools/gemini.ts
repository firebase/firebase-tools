import * as utils from "../../../utils";
import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";
import { AIToolModule } from "./types";
import { getBaseContext, getFunctionsContext } from "./context";
import { findFirebaseSection, replaceFirebaseSection, generateDiff } from "./configManager";
import { confirm } from "../../../prompt";

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

    // Create main FIREBASE.md with imports
    let mainContent = `<firebase_prompts version="1.0.0" features="${enabledFeatures.join(",")}">
<!-- Firebase Tools Context - Auto-generated, do not edit -->

# Firebase Context

<!-- Import base Firebase context -->
@./contexts/firebase-base.md
`;

    if (enabledFeatures.includes("functions")) {
      mainContent += `
<!-- Import Firebase Functions context -->
@./contexts/firebase-functions.md
`;
    }

    mainContent += `
</firebase_prompts>
`;

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
        // Check if version and features match - if so, skip update
        const currentFeatures = enabledFeatures.sort().join(",");
        const existingFeatures = (existingSection.features || []).sort().join(",");
        
        if (existingSection.version === "1.0.0" && existingFeatures === currentFeatures) {
          utils.logLabeledSuccess("Gemini", "Configuration is already up to date ✓");
          if (currentFeatures) {
            utils.logBullet(`   Optimized for: ${currentFeatures}`);
          }
          return;
        }
        
        // Version or features changed, show diff
        const newContent = replaceFirebaseSection(existingContent, mainContent);
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
          message: "Apply this change to .gemini/extensions/firebase/FIREBASE.md?",
          default: true,
        });

        if (!shouldApply) {
          utils.logBullet("🚫 Skipping Gemini CLI update.");
          return;
        }

        config.writeProjectFile(contextPath, newContent);
      } else {
        // No Firebase section found, just overwrite
        config.writeProjectFile(contextPath, mainContent);
      }
    } else {
      // New file
      config.writeProjectFile(contextPath, mainContent);
    }

    console.log();
    utils.logLabeledSuccess("Gemini", "Extension configured successfully!");
    utils.logBullet("📁 Created files:");
    utils.logBullet(`   • .gemini/extensions/firebase/gemini-extension.json`);
    utils.logBullet(`   • .gemini/extensions/firebase/FIREBASE.md (main context)`);
    utils.logBullet(`   • .gemini/extensions/firebase/contexts/ (modular contexts)`);
    if (enabledFeatures.includes("functions")) {
      utils.logSuccess(`   ✓ Firebase Functions context included`);
    }
  },
};
