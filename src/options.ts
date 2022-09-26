import { Config } from "./config";
import { HostingMultiple } from "./firebaseConfig";
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

  // Hosting-specific (including web frameworks) options
  normalizedHostingConfig?: HostingMultiple;
  site?: string; // When using a single hosting site, this may be filled by firedata
  expires?: `${number}${"h" | "d" | "m"}`;

  // Emulator options:
  port?: number;

  // TODO(samstern): Remove this once options is better typed
  [key: string]: unknown;
}
