import { RC } from "../../src/rc";
import { Options } from "../../src/options";
import { Command } from "../../src/command";
import { ExtensionContext } from "vscode";
import { setInquirerOptions } from "./stubs/inquirer-stub";
import { Config } from "../../src/config";
import { globalSignal } from "./utils/globals";

/**
 * User-facing CLI options
 */
const defaultOptions: Options = {
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
  exportOnExit: false,
  import: "",
};

/**
 * User-facing CLI options
 */
export const currentOptions = globalSignal({ ...defaultOptions });

export function updateOptions(
  context: ExtensionContext,
  firebaseJSON: Config,
  firebaseRC: RC
) {
  if (firebaseJSON) {
    currentOptions.value.config = firebaseJSON;
    currentOptions.value.configPath = `${currentOptions.value.cwd}/firebase.json`;
    if (firebaseJSON.has("hosting")) {
      currentOptions.value = {
        ...currentOptions.value,
        ...firebaseJSON.get("hosting"),
      };
    }
  } else {
    currentOptions.value.configPath = "";
  }
  if (firebaseRC) {
    currentOptions.value.rc = firebaseRC;
    currentOptions.value.project = firebaseRC.projects?.default;
  } else {
    currentOptions.value.rc = null;
    currentOptions.value.project = "";
  }
  context.globalState.setKeysForSync(["currentOptions"]);
  context.globalState.update("currentOptions", currentOptions.value);
  setInquirerOptions(currentOptions.value);
}

/**
 * Temporary options to pass to a command, don't write.
 * Mostly runs it through the CLI's command.prepare() options formatter.
 */
export async function getCommandOptions(
  firebaseJSON: Config,
  options: Options = currentOptions.value
): Promise<Options> {
  // Use any string, it doesn't affect `prepare()`.
  const command = new Command("deploy");
  let newOptions = Object.assign(options, { config: options.configPath });
  if (firebaseJSON?.has("hosting")) {
    newOptions = Object.assign(newOptions, firebaseJSON.get("hosting"));
  }
  await command.prepare(newOptions);
  return newOptions as Options;
}
