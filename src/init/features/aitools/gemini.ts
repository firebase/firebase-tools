import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";
import { AIToolModule, AIToolConfigResult } from "./types";
import {
  replaceFirebaseFile,
  generatePromptSection,
  generateFeaturePromptSection,
} from "./promptUpdater";
import { deepEqual } from "../../../utils";

export const gemini: AIToolModule = {
  name: "gemini",
  displayName: "Gemini CLI",

  /**
   * Configures the Gemini CLI extension for Firebase.
   *
   * This function sets up the necessary context files for Gemini to understand the
   * Firebase project structure. It creates a `.gemini/extensions/firebase` directory
   * with the following files:
   *
   * - `gemini-extension.json`: The main configuration for the extension.
   * - `contexts/FIREBASE.md`: The main entry point for project-specific context. It imports other files.
   * - `contexts/FIREBASE-BASE.md`: Contains fundamental details about the Firebase project.
   * - `contexts/FIREBASE-FUNCTIONS.md`: (Optional) Contains information about Firebase Functions if the feature is enabled.
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
      const existingRaw = config.readProjectFile(extensionPath);
      const existingConfig = JSON.parse(existingRaw);
      const newConfig = JSON.parse(extensionConfig);

      if (!deepEqual(existingConfig, newConfig)) {
        config.writeProjectFile(extensionPath, extensionConfig);
        extensionUpdated = true;
      }
    } catch {
      // File doesn't exist or is invalid JSON, needs to be (re)created
      config.writeProjectFile(extensionPath, extensionConfig);
      extensionUpdated = true;
    }
    files.push({ path: extensionPath, updated: extensionUpdated });

    const baseDir = ".gemini/extensions/firebase";

    // Create the base Firebase context file (FIREBASE-BASE.md).
    // This file contains fundamental details about the Firebase project.
    const baseContent = generateFeaturePromptSection("base");
    const basePath = `${baseDir}/contexts/FIREBASE-BASE.md`;
    const baseResult = await replaceFirebaseFile(config, basePath, baseContent);
    files.push({ path: basePath, updated: baseResult.updated });

    // If Functions are enabled, create the Functions-specific context file.
    if (enabledFeatures.includes("functions")) {
      const functionsContent = generateFeaturePromptSection("functions");
      const functionsPath = `${baseDir}/contexts/FIREBASE-FUNCTIONS.md`;
      const functionsResult = await replaceFirebaseFile(config, functionsPath, functionsContent);
      files.push({ path: functionsPath, updated: functionsResult.updated });
    }

    // Create the main `FIREBASE.md` file, which acts as an entry point
    // and imports the other context files. This provides a consolidated
    // view of the project for Gemini.
    const imports = [
      "# Firebase Context",
      "",
      "<!-- Import base Firebase context -->",
      "@./contexts/FIREBASE-BASE.md",
    ];
    if (enabledFeatures.includes("functions")) {
      imports.push(
        "",
        "<!-- Import Firebase Functions context -->",
        "@./contexts/FIREBASE-FUNCTIONS.md",
      );
    }
    const importContent = imports.join("\n");

    const { content: mainContent } = generatePromptSection(enabledFeatures, {
      customContent: importContent,
    });

    const contextPath = `${baseDir}/FIREBASE.md`;

    const mainResult = await replaceFirebaseFile(config, contextPath, mainContent);
    files.push({ path: contextPath, updated: mainResult.updated });

    return { files };
  },
};
