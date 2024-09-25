import { RC } from "../../src/rc";
import { Options } from "../../src/options";
import { Command } from "../../src/command";
import { ExtensionContext } from "vscode";
import { setInquirerOptions } from "./stubs/inquirer-stub";
import { Config } from "../../src/config";
import { globalSignal } from "./utils/globals";
import * as vscode from "vscode";
import { effect } from "@preact/signals-core";
import { firebaseConfig, firebaseRC, getConfigPath } from "./core/config";

export type VsCodeOptions = Options & { isVSCE: boolean; rc: RC | null };

const defaultOptions: Readonly<VsCodeOptions> = {
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
  rc: new RC(),
  exportOnExit: false,
  import: "",

  isVSCE: true,
};

/**
 * User-facing CLI options
 */
// TODO(rrousselGit): options should default to "undefined" until initialized,
// instead of relying on invalid default values.
export const currentOptions = globalSignal({ ...defaultOptions });

export function registerOptions(context: ExtensionContext): vscode.Disposable {
  currentOptions.value.cwd = getConfigPath()!;
  const cwdSync = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    currentOptions.value = {
      ...currentOptions.peek(),
      cwd: getConfigPath()!,
    };
  });

  const firebaseConfigSync = effect(() => {
    const previous = currentOptions.peek();

    const config = firebaseConfig.value?.tryReadValue;
    if (config) {
      currentOptions.value = {
        ...previous,
        config,
        configPath: `${previous.cwd}/firebase.json`,
      };
    } else {
      currentOptions.value = {
        ...previous,
        config: new Config({}),
        configPath: "",
      };
    }
  });

  const rcSync = effect(() => {
    const previous = currentOptions.peek();

    const rc = firebaseRC.value?.tryReadValue;
    if (rc) {
      currentOptions.value = {
        ...previous,
        rc,
        project: rc.projects?.default,
        projectId: rc.projects?.default,
      };
    } else {
      currentOptions.value = {
        ...previous,
        rc: null as any,
        project: "",
      };
    }
  });

  const notifySync = effect(() => {
    currentOptions.value;

    context.globalState.setKeysForSync(["currentOptions"]);
    context.globalState.update("currentOptions", currentOptions.value);
    setInquirerOptions(currentOptions.value);
  });

  return vscode.Disposable.from(
    cwdSync,
    { dispose: firebaseConfigSync },
    { dispose: rcSync },
    { dispose: notifySync },
  );
}
