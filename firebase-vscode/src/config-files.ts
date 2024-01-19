import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ExtensionBrokerImpl } from "./extension-broker";
import { updateOptions, currentOptions } from "./options";
import { RC } from "../../src/rc";
import { Config } from "../../src/config";
import { pluginLogger } from "./logger-wrapper";
import isEmpty from "lodash/isEmpty";
import { workspace } from "./utils/test_hooks";

export function getRootFolders() {
  if (!workspace.value) {
    return [];
  }
  const folders = workspace.value.workspaceFolders
    ? workspace.value.workspaceFolders.map((wf) => wf.uri.fsPath)
    : [];
  if (workspace.value.workspaceFile) {
    folders.push(path.dirname(workspace.value.workspaceFile.fsPath));
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
      currentOptions.value.cwd = folder;
      return folder;
    }
  }
  currentOptions.value.cwd = rootFolders[0];
  return rootFolders[0];
}

/**
 * Parse firebase.json and .firebaserc from the configured location, if they
 * exist, and write to memory.
 */
export function readFirebaseConfigs(context: vscode.ExtensionContext) {
  const configPath = getConfigPath();
  let firebaseRC: RC;
  let firebaseJSON: Config;
  try {
    firebaseRC = RC.loadFile(path.join(configPath, ".firebaserc"));
  } catch (e) {
    pluginLogger.error(e.message);
    throw e;
  }

  // RC.loadFile doesn't throw if not found, it just returns an empty object
  if (isEmpty(firebaseRC.data)) {
    firebaseRC = null;
  }

  try {
    firebaseJSON = Config.load({
      configPath: path.join(configPath, "firebase.json"),
    });
  } catch (e) {
    if (e.status === 404) {
      firebaseJSON = null;
    } else {
      pluginLogger.error(e.message);
      throw e;
    }
  }
  updateOptions(context, firebaseJSON, firebaseRC);
  return { firebaseJSON, firebaseRC };
}

/**
 *  Read Firebase configs and then send it to webviews through the given broker
 */
export async function readAndSendFirebaseConfigs(
  broker: ExtensionBrokerImpl,
  context: vscode.ExtensionContext
) {
  const { firebaseJSON, firebaseRC } = readFirebaseConfigs(context);
  broker.send("notifyFirebaseConfig", {
    firebaseJson: firebaseJSON?.data,
    firebaseRC: firebaseRC?.data,
  });
}

/**
 * Write new default project to .firebaserc
 */
export async function updateFirebaseRCProject(
  context: vscode.ExtensionContext,
  alias: string,
  projectId: string
) {
  if (!currentOptions.value.rc) {
    if (!currentOptions.value.cwd) {
      currentOptions.value.cwd = getConfigPath();
    }
    currentOptions.value.rc = new RC(
      path.join(currentOptions.value.cwd, ".firebaserc"),
      {}
    );
  }
  currentOptions.value.rc.addProjectAlias(alias, projectId);
  currentOptions.value.rc.save();
  updateOptions(context, undefined, currentOptions.value.rc);
}

/**
 * Set up a FileSystemWatcher for .firebaserc and firebase.json Also un-watch and re-watch when the
 * configuration for where in the workspace the .firebaserc and firebase.json are.
 */
export function setupFirebaseJsonAndRcFileSystemWatcher(
  broker: ExtensionBrokerImpl,
  context: vscode.ExtensionContext
): vscode.Disposable {
  // Create a new watcher
  let watcher = newWatcher();

  // Return a disposable that tears down a watcher if it's active
  return {
    dispose() {
      watcher && watcher.dispose();
    },
  };

  // HelperFunction to create a new watcher
  function newWatcher() {
    if (!currentOptions.value.cwd) {
      return null;
    }

    let watcher = workspace.value.createFileSystemWatcher(
      path.join(currentOptions.value.cwd, "{firebase.json,.firebaserc}")
    );
    watcher.onDidChange(async () => {
      readAndSendFirebaseConfigs(broker, context);
    });
    return watcher;
  }
}
