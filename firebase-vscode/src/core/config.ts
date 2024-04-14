import { Disposable, FileSystemWatcher } from "vscode";
import * as vscode from "vscode";
import path from "path";
import fs from "fs";
import { currentOptions } from "../options";
import { ExtensionBrokerImpl } from "../extension-broker";
import { RC, RCData } from "../../../src/rc";
import { Config } from "../../../src/config";
import { globalSignal } from "../utils/globals";
import { workspace } from "../utils/test_hooks";
import { onChange } from "../utils/signal";
import { pluginLogger } from "../logger-wrapper";

export const firebaseRC = globalSignal<RC | undefined>(undefined);
export const firebaseConfig = globalSignal<Config | undefined>(undefined);

function notifyFirebaseConfig(broker: ExtensionBrokerImpl) {
  broker.send("notifyFirebaseConfig", {
    firebaseJson: firebaseConfig.value?.data,
    firebaseRC: firebaseRC.value?.data,
  });
}

function registerRc(broker: ExtensionBrokerImpl): Disposable {
  firebaseRC.value = _readRC();
  const rcRemoveListener = onChange(firebaseRC, () =>
    notifyFirebaseConfig(broker)
  );

  const rcWatcher = _createWatcher(".firebaserc");
  rcWatcher?.onDidChange(() => (firebaseRC.value = _readRC()));
  rcWatcher?.onDidCreate(() => (firebaseRC.value = _readRC()));
  rcWatcher?.onDidDelete(() => (firebaseRC.value = undefined));

  return Disposable.from(
    { dispose: rcRemoveListener },
    { dispose: () => rcWatcher?.dispose() }
  );
}

function registerFirebaseConfig(broker: ExtensionBrokerImpl): Disposable {
  firebaseConfig.value = _readFirebaseConfig();

  const firebaseConfigRemoveListener = onChange(firebaseConfig, () =>
    notifyFirebaseConfig(broker)
  );

  const configWatcher = _createWatcher("firebase.json");
  configWatcher?.onDidChange(
    () => (firebaseConfig.value = _readFirebaseConfig())
  );
  configWatcher?.onDidCreate(
    () => (firebaseConfig.value = _readFirebaseConfig())
  );
  configWatcher?.onDidDelete(() => (firebaseConfig.value = undefined));

  return Disposable.from(
    { dispose: firebaseConfigRemoveListener },
    { dispose: () => configWatcher?.dispose() }
  );
}

export function registerConfig(broker: ExtensionBrokerImpl): Disposable {
  // On getInitialData, forcibly notifies the extension.
  const getInitialDataRemoveListener = broker.on("getInitialData", () => {
    notifyFirebaseConfig(broker);
  });

  // TODO handle deletion of .firebaserc/.firebase.json/firemat.yaml

  return Disposable.from(
    { dispose: getInitialDataRemoveListener },
    registerFirebaseConfig(broker),
    registerRc(broker)
  );
}

/** @internal */
export function _readRC(): RC | undefined {
    const configPath = getConfigPath();
    if (!configPath) {
      return undefined;
    }
try {
    // RC.loadFile silences errors and returns a non-empty object if the rc file is
    // missing. Let's load it ourselves.

    const rcPath = path.join(configPath, ".firebaserc");

    if (!fs.existsSync(rcPath)) {
      return undefined;
    }

    const json = fs.readFileSync(rcPath);
    const data = JSON.parse(json.toString());

    return new RC(rcPath, data);
} catch (e: any) {
    pluginLogger.error(e.message);
    throw e;
  }
}

/** @internal */
export function _readFirebaseConfig(): Config | undefined {
    const configPath = getConfigPath();
    if (!configPath) {
      return undefined;
    }
    try {
    const json = Config.load({
      configPath: path.join(configPath, "firebase.json"),
    });
    // "null" is non-reachable when specifying a configPath.
    // If the file is missing, load() will throw (even if "allowMissing" is true).
    return json!;
  } catch (e: any) {
    if (e.status === 404) {
      return undefined;
    } else {
      pluginLogger.error(e.message);
      throw e;
    }
}
}

/** @internal */
export function _createWatcher(file: string): FileSystemWatcher | undefined {
  if (!currentOptions.value.cwd) {
    return undefined;
  }

  return workspace.value?.createFileSystemWatcher(
    // Using RelativePattern enables tests to use watchers too.
    new vscode.RelativePattern(vscode.Uri.file(currentOptions.value.cwd), file)
  );
}

export function getRootFolders() {
  const ws = workspace.value;
  if (!ws) {
    return [];
  }
  const folders = ws.workspaceFolders
    ? ws.workspaceFolders.map((wf) => wf.uri.fsPath)
    : [];
  if (ws.workspaceFile) {
    folders.push(path.dirname(ws.workspaceFile.fsPath));
  }
  return Array.from(new Set(folders));
}

export function getConfigPath(): string | undefined {
  // Usually there's only one root folder unless someone is using a
  // multi-root VS Code workspace.
  // https://code.visualstudio.com/docs/editor/multi-root-workspaces
  // We are trying to play it safe by assigning the cwd
  // based on where a .firebaserc or firebase.json was found but if
  // the user hasn't run firebase init there won't be one, and without
  // a cwd we won't know where to put it.
  const rootFolders = getRootFolders();

  let folder = rootFolders.find((folder) => {
    return (
      fs.existsSync(path.join(folder, ".firebaserc")) ||
      fs.existsSync(path.join(folder, "firebase.json"))
    );
  });

  folder ??= rootFolders[0];
  return folder;
}
