import { Config } from "../../../config";
import * as path from "path";
import * as os from "os";
import { readTemplateSync } from "../../../templates";
import { AIToolModule, AIToolConfigResult } from "./types";
import {
  replaceFirebaseFile,
  generatePromptSection,
  generateFeaturePromptSection,
} from "./promptUpdater";
import { deepEqual } from "../../../utils";

// Define constants at the module level for clarity and reuse.
const GEMINI_DIR = ".gemini/extensions/firebase";
const CONTEXTS_DIR = `${GEMINI_DIR}/contexts`;

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

    // Part 1: Configure the main gemini-extension.json file.
    const extensionPath = `${GEMINI_DIR}/gemini-extension.json`;
    const extensionTemplate = readTemplateSync("init/aitools/gemini-extension.json");
    const newConfigRaw = extensionTemplate.replace("{{PROJECT_PATH}}", projectPath);

    let extensionUpdated = false;
    try {
      const existingRaw = config.readProjectFile(extensionPath);
      const existingConfig = JSON.parse(existingRaw);
      const newConfig = JSON.parse(newConfigRaw);

      if (!deepEqual(existingConfig, newConfig)) {
        config.writeProjectFile(extensionPath, newConfigRaw);
        extensionUpdated = true;
      }
    } catch {
      // File doesn't exist or is invalid JSON, so we (re)create it.
      config.writeProjectFile(extensionPath, newConfigRaw);
      extensionUpdated = true;
    }
    files.push({ path: extensionPath, updated: extensionUpdated });

    // Part 2: Generate feature-specific context files (e.g., FIREBASE-BASE.md).
    const baseContent = generateFeaturePromptSection("base");
    const basePath = `${CONTEXTS_DIR}/FIREBASE-BASE.md`;
    const baseResult = await replaceFirebaseFile(config, basePath, baseContent);
    files.push({ path: basePath, updated: baseResult.updated });

    // Part 3: Create the main FIREBASE.md file that imports the context files.
    const imports = [
      "# Firebase Context",
      "",
      "<!-- Import base Firebase context -->",
      `@./contexts/FIREBASE-BASE.md`,
    ];
    if (enabledFeatures.includes("functions")) {
      const functionsContent = generateFeaturePromptSection("functions");
      const functionsPath = `${CONTEXTS_DIR}/FIREBASE-FUNCTIONS.md`;
      const functionsResult = await replaceFirebaseFile(config, functionsPath, functionsContent);
      files.push({ path: functionsPath, updated: functionsResult.updated });

      imports.push(
        "",
        "<!-- Import Firebase Functions context -->",
        `@./contexts/FIREBASE-FUNCTIONS.md`,
      );
    }
    const importContent = imports.join("\n");

    const { content: mainContent } = generatePromptSection(enabledFeatures, {
      customContent: importContent,
    });

    const contextPath = `${GEMINI_DIR}/FIREBASE.md`;
    const mainResult = await replaceFirebaseFile(config, contextPath, mainContent);
    files.push({ path: contextPath, updated: mainResult.updated });

    return { files };
  },

  getSkillPath(): string {
    return path.join(os.homedir(), ".gemini/skills");
  },
};
