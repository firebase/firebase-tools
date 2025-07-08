import * as utils from "../../../utils";
import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";
import { AIToolModule } from "./types";
import { getBaseContext, getFunctionsContext, getPromptVersions } from "./context";
import {
  wrapInFirebaseTags,
  findFirebaseSection,
  replaceFirebaseSection,
  insertFirebaseSection,
} from "./configManager";
import { parseVersionsString } from "./promptVersions";

export const studio: AIToolModule = {
  name: "studio",
  displayName: "Firebase Studio",

  async configure(config: Config, projectPath: string, enabledFeatures: string[]): Promise<void> {
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
    let firebaseContext =
      "This is a Firebase project with the following structure and conventions:\n\n";
    firebaseContext += getBaseContext();

    // Add Functions-specific guidance if enabled
    if (enabledFeatures.includes("functions")) {
      firebaseContext += "\n\n## Firebase Functions Guidelines\n\n";
      firebaseContext += getFunctionsContext();
    }

    // Get prompt versions and wrap in Firebase tags
    const promptVersions = getPromptVersions(enabledFeatures);
    const firebaseContent = wrapInFirebaseTags(firebaseContext, promptVersions);

    // Check if we need to update existing content
    const existingSection = findFirebaseSection(existingContent);
    let newContent: string;

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
      newContent = replaceFirebaseSection(existingContent, firebaseContent);
    } else if (existingContent) {
      // Append to existing file
      newContent = insertFirebaseSection(existingContent, firebaseContent);
    } else {
      // New file, add header + content
      newContent = header + "\n\n" + firebaseContent;
    }

    // Write the AI rules file
    config.writeProjectFile(rulesPath, newContent);

    utils.logSuccess("✓ Firebase Studio configuration written to:");
    utils.logBullet("  - .idx/airules.md");
  },
};
