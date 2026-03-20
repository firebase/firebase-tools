import { Config } from "../../../config";

export interface AIToolConfigResult {
  files: Array<{
    path: string;
    updated: boolean;
  }>;
}

export interface AIToolModule {
  name: string;
  displayName: string;

  /**
   * Configure the AI tool with Firebase context
   * @param config Firebase config object for writing files
   * @param projectPath Absolute path to the Firebase project
   * @param enabledFeatures List of enabled Firebase features for context optimization
   * @returns Result object with update status and list of files created/updated
   */
  configure(
    config: Config,
    projectPath: string,
    enabledFeatures: string[],
  ): Promise<AIToolConfigResult>;
}

export interface AIToolChoice {
  value: string;
  name: string;
  checked: boolean;
}
