import * as utils from "../../../utils";
import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";
import { AIToolModule } from "./types";
import { getCombinedContext } from "./context";

export const gemini: AIToolModule = {
  name: "gemini",
  displayName: "Gemini CLI",
  
  async configure(
    config: Config,
    projectPath: string,
    enabledFeatures: string[]
  ): Promise<void> {
    // Create extension configuration from template
    const extensionTemplate = readTemplateSync("init/aitools/gemini-extension.json");
    const extensionConfig = extensionTemplate.replace("{{PROJECT_PATH}}", projectPath);
    config.writeProjectFile(
      ".gemini/extensions/firebase/gemini-extension.json",
      extensionConfig
    );

    // Write combined context file (Gemini CLI requires a single file)
    const combinedContext = getCombinedContext(enabledFeatures);
    config.writeProjectFile(".gemini/extensions/firebase/FIREBASE.md", combinedContext);

    utils.logBullet(`✓ Gemini CLI extension created at:`);
    utils.logBullet(`  - .gemini/extensions/firebase/`);
    utils.logBullet(`  - Context includes: FIREBASE.md`);
    if (enabledFeatures.includes("functions")) {
      utils.logBullet(`  - With Firebase Functions context included`);
    }
  }
};