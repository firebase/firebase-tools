import { Config } from "../../../config";
import { AIToolModule, AIToolConfigResult } from "./types";
import { updateFirebaseSection } from "./promptUpdater";

const RULES_PATH = ".idx/airules.md";

export const studio: AIToolModule = {
  name: "studio",
  displayName: "Firebase Studio",

  /**
   * Configures Firebase Studio (Project IDX) with Firebase context.
   *
   * - .idx/airules.md: Updates Firebase section only (preserves user content)
   *
   * Interactive prompts are shown since this file may contain user-defined
   * AI rules and instructions that we must preserve. We only manage the
   * Firebase-specific section marked with our XML tags.
   */
  async configure(
    config: Config,
    projectPath: string,
    enabledFeatures: string[],
  ): Promise<AIToolConfigResult> {
    const files: AIToolConfigResult["files"] = [];
    const { updated } = await updateFirebaseSection(config, RULES_PATH, enabledFeatures, {
      interactive: true,
    });
    files.push({ path: RULES_PATH, updated });
    return { files };
  },
};
