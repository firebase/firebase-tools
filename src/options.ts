import { Config } from "./config";
import { HostingResolved } from "./firebaseConfig";
import { RC } from "./rc";

/**
 * Options are values passed from command-line options, the contents of
 * firebase.json, and target mappings.
 * This is a monolith that is hard to mock for unit testing. It is recommended
 * that each codebase implements a smaller interface that Options conforms to
 * that documents the needs for each codebase. For an example of this, and how
 * to keep the two types in sync, see src/hosting/options.ts
 */
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
  normalizedHostingConfig?: HostingResolved[];
  site?: string; // When using a single hosting site, this may be filled by firedata
  expires?: `${number}${"h" | "d" | "m"}`;

  // Emulator options:
  port?: number;

  // TODO(samstern): Remove this once options is better typed
  [key: string]: unknown;
}
