import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";
import { AIToolModule, AIToolConfigResult } from "./types";
import {
  replaceFirebaseFile,
  generatePromptSection,
  generateFeaturePromptSection,
} from "./promptUpdater";

export const gemini: AIToolModule = {
  name: "gemini",
  displayName: "Gemini CLI",

  /**
   * Configures Gemini CLI with Firebase extension.
   *
   * File ownership:
   * - ALL files under .gemini/extensions/firebase/: Fully managed by us
   *
   * Since this is a dedicated Firebase extension directory, we own all files
   * and can safely replace them without worrying about user customizations.
   * Users don't typically edit extension files directly.
   */
  async configure(
    config: Config,
    projectPath: string,
    enabledFeatures: string[],
  ): Promise<AIToolConfigResult> {
    const files: AIToolConfigResult["files"] = [];
    const extensionTemplate = readTemplateSync("init/aitools/gemini-extension.json");
    const extensionConfig = extensionTemplate.replace("{{PROJECT_PATH}}", projectPath);
    const extensionPath = ".gemini/extensions/firebase/gemini-extension.json";

    // Check if extension config exists and needs updating
    let extensionUpdated = false;
    try {
      const existing = config.readProjectFile(extensionPath);
      if (existing !== extensionConfig) {
        config.writeProjectFile(extensionPath, extensionConfig);
        extensionUpdated = true;
      }
    } catch {
      // File doesn't exist, needs to be created
      config.writeProjectFile(extensionPath, extensionConfig);
      extensionUpdated = true;
    }
    files.push({ path: extensionPath, updated: extensionUpdated });

    const baseDir = ".gemini/extensions/firebase";

    const baseContent = generateFeaturePromptSection("base");
    const basePath = `${baseDir}/contexts/firebase-base.md`;
    const baseResult = await replaceFirebaseFile(config, basePath, baseContent);
    files.push({ path: basePath, updated: baseResult.updated });

    if (enabledFeatures.includes("functions")) {
      const functionsContent = generateFeaturePromptSection("functions");
      const functionsPath = `${baseDir}/contexts/firebase-functions.md`;
      const functionsResult = await replaceFirebaseFile(config, functionsPath, functionsContent);
      files.push({ path: functionsPath, updated: functionsResult.updated });
    }

    // Generate the main FIREBASE.md content with imports
    const importContent = `# Firebase Context

<!-- Import base Firebase context -->
@./contexts/firebase-base.md
${
  enabledFeatures.includes("functions")
    ? `
<!-- Import Firebase Functions context -->
@./contexts/firebase-functions.md`
    : ""
}`;

    const { content: mainContent } = generatePromptSection(enabledFeatures, {
      customContent: importContent,
    });

    const contextPath = `${baseDir}/FIREBASE.md`;

    const mainResult = await replaceFirebaseFile(config, contextPath, mainContent);
    files.push({ path: contextPath, updated: mainResult.updated });

    return { files };
  },
};
