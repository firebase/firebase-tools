import { effect, signal } from "@preact/signals-react";
import { Disposable, workspace } from "vscode";
import path from "path";
import fs from "fs";
import { currentOptions } from "../options";
import { pluginLogger } from "../logger-wrapper";
import { isEmpty } from "lodash";
import { ExtensionBrokerImpl } from "../extension-broker";
import { FirebaseConfig } from "../../../src/firebaseConfig";
import { RC, RCData } from "../../../src/rc";
import { Config } from "../../../src/config";

export const firebaseRC = signal<RC | undefined>(undefined);

export const firebaseConfig = signal<Config | undefined>(undefined);

export function registerConfig(broker: ExtensionBrokerImpl): Disposable {
  firebaseRC.value = readRC();
  firebaseConfig.value = readConfig();

  const notifyFirebaseConfig = () =>
    broker.send("notifyFirebaseConfig", {
      firebaseJson: firebaseConfig.value.data,
      firebaseRC: firebaseRC.value.data,
    });

  broker.on("getInitialData", () => {
    notifyFirebaseConfig();
  });

  const rcWatcher = createWatcher(".firebaserc");
  rcWatcher.onDidChange(() => {
    firebaseRC.value = readRC();
    notifyFirebaseConfig();
  });

  const jsonWatcher = createWatcher("firebase.json");
  jsonWatcher.onDidChange(() => {
    firebaseConfig.value = readConfig();
    notifyFirebaseConfig();
  });

  return {
    dispose: () => {
      rcWatcher.dispose();
      jsonWatcher.dispose();
    },
  };
}

function readRC() {
  const configPath = getConfigPath();
  try {
    const rc = RC.loadFile(path.join(configPath, ".firebaserc"));
    // RC.loadFile doesn't throw if not found, it just returns an empty object
    return isEmpty(rc.data) ? undefined : rc;
  } catch (e) {
    pluginLogger.error(e.message);
    throw e;
  }
}

function readConfig() {
  const configPath = getConfigPath();
  try {
    const json = Config.load({
      configPath: path.join(configPath, "firebase.json"),
    });
    return json;
  } catch (e) {
    if (e.status === 404) {
      return undefined;
    } else {
      pluginLogger.error(e.message);
      throw e;
    }
  }
}

function createWatcher(file: string) {
  if (!currentOptions.cwd) {
    return null;
  }

  const watcher = workspace.createFileSystemWatcher(
    path.join(currentOptions.cwd, file)
  );
  return watcher;
}

export function getRootFolders() {
  if (!workspace) {
    return [];
  }
  const folders = workspace.workspaceFolders
    ? workspace.workspaceFolders.map((wf) => wf.uri.fsPath)
    : [];
  if (workspace.workspaceFile) {
    folders.push(path.dirname(workspace.workspaceFile.fsPath));
  }
  return Array.from(new Set(folders));
}

function getConfigPath(): string {
  // Usually there's only one root folder unless someone is using a
  // multi-root VS Code workspace.
  // https://code.visualstudio.com/docs/editor/multi-root-workspaces
  // We are trying to play it safe by assigning the cwd
  // based on where a .firebaserc or firebase.json was found but if
  // the user hasn't run firebase init there won't be one, and without
  // a cwd we won't know where to put it.
  const rootFolders = getRootFolders();
  for (const folder of rootFolders) {
    if (
      fs.existsSync(path.join(folder, ".firebaserc")) ||
      fs.existsSync(path.join(folder, "firebase.json"))
    ) {
      currentOptions.cwd = folder;
      return folder;
    }
  }
  currentOptions.cwd = rootFolders[0];
  return rootFolders[0];
}
