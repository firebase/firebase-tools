import { Config } from "./config";
import { RC } from "./rc";

// Options come from command-line options and stored config values
// TODO: actually define all of this stuff in command.ts and import it from there.
export interface BaseOptions {
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
  nonInteractive: boolean;
  interactive: boolean;
  debug: boolean;

  rc: RC;
  // Emulator specific import/export options
  exportOnExit?: boolean | string;
  import?: string;

  isMCP?: boolean;

  /**
   * Do not use this field when handling --json. It is never set in commands.
   *
   * Instead, return an object to be JSONified from the command action callback:
   *
   * ```typescript
   *    .action(async (options: Options) => {
   *      logger.info('Normal output'); // Automatically suppressed with --json.
   *      return objectToBePrintedWhenTheJsonFlagIsPassed;
   *    });
   * ```
   */
  json?: undefined;
}

export interface Options extends BaseOptions {
  // TODO(samstern): Remove this once options is better typed
  [key: string]: unknown;

  // whether it's coming from the VS Code Extension
  isVSCE?: true;
}
