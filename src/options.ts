import { Config } from "./config";
import { RC } from "./rc";

// Options come from command-line options and stored config values
// TODO: actually define all of this stuff in command.ts and import it from there.
export interface Options {
  cwd: string;
  configPath: string;
  only: string;
  except: string;
  config: Config;
  filteredTargets: string[];
  force: boolean;

  // Options which are present on every command
  project?: string;
  projectAlias?: string;
  projectId?: string;
  projectNumber?: string;
  projectRoot?: string;
  account?: string;
  json: boolean;
  nonInteractive: boolean;
  interactive: boolean;
  debug: boolean;

  rc: RC;

  // TODO(samstern): Remove this once options is better typed
  [key: string]: unknown;
}
