import { Config } from "./config";

// Options come from command-line options and stored config values
// TODO: actually define all of this stuff in command.ts and import it from there.
export interface Options {
  cwd: string;
  configPath: string;
  // OMITTED: project. Use context.projectId instead
  only: string;
  config: Config;
  filteredTargets: string[];
  nonInteractive: boolean;
  force: boolean;

  // TODO(samstern): Remove this once options is better typed
  [key: string]: unknown;
}
