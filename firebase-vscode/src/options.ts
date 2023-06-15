import { RC } from "../../src/rc";
import { BaseOptions, Options } from "../../src/options";
import { Command } from "../../src/command";
import { ExtensionContext } from "vscode";
import { setInquirerOptions } from "./stubs/inquirer-stub";
import { Config } from "../../src/config";

/**
 * User-facing CLI options
 * Passed to command.prepare()
 */

interface CliOptions extends Omit<BaseOptions, "config"> {
  config: string;
}

/**
 * Final options passed to CLI command functions
 * Result of command.prepare()
 */
interface CommandOptions extends Options {}

/**
 * User-facing CLI options
 */
export let currentOptions: Options & { isVSCE: boolean } = {
  cwd: "",
  configPath: "",
  only: "",
  except: "",
  config: new Config({}),
  filteredTargets: [],
  force: true,

  // Options which are present on every command
  project: "",
  projectAlias: "",
  projectId: "",
  projectNumber: "",
  projectRoot: "",
  account: "",
  json: true,
  nonInteractive: true,
  interactive: false,
  debug: false,

  rc: null,
  isVSCE: true
};

export function updateOptions(
  context: ExtensionContext,
  firebaseJSON: Config,
  firebaseRC: RC
) {
  if (firebaseJSON) {
    currentOptions.config = firebaseJSON;
    currentOptions.configPath = `${currentOptions.cwd}/firebase.json`;
    if (firebaseJSON.has('hosting')) {
      currentOptions = {
        ...currentOptions,
        ...firebaseJSON.get('hosting'),
      };
    }
  } else {
    currentOptions.configPath = "";
  }
  if (firebaseRC) {
    currentOptions.rc = firebaseRC;
    currentOptions.project = firebaseRC.projects?.default;
  } else {
    currentOptions.rc = null;
    currentOptions.project = "";
  }
  context.globalState.setKeysForSync(["currentOptions"]);
  context.globalState.update("currentOptions", currentOptions);
  setInquirerOptions(currentOptions);
}

/**
 * Temporary options to pass to a command, don't write.
 * Mostly runs it through the CLI's command.prepare() options formatter.
 */
export async function getCommandOptions(
  firebaseJSON: Config,
  options: Options = currentOptions
): Promise<CommandOptions> {
  // Use any string, it doesn't affect `prepare()`.
  const command = new Command("deploy");
  let newOptions = Object.assign(options, { config: options.configPath });
  if (firebaseJSON?.has('hosting')) {
    newOptions = Object.assign(newOptions, firebaseJSON.get('hosting'));
  }
  await command.prepare(newOptions);
  return newOptions as CommandOptions;
}
