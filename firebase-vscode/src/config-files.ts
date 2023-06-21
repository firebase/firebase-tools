import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { workspace } from "vscode";
import { ExtensionBrokerImpl } from "./extension-broker";
import { updateOptions, currentOptions } from "./options";
import { RC } from "./rc";
import { Config } from "./config";
import { pluginLogger } from "./logger-wrapper";

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
    if (fs.existsSync(path.join(folder, '.firebaserc'))
      || fs.existsSync(path.join(folder, 'firebase.json'))) {
      currentOptions.cwd = folder;
      return folder;
    }
  }
  currentOptions.cwd = rootFolders[0];
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
    firebaseRC = RC.loadFile(path.join(configPath, '.firebaserc'));
  } catch (e) {
    if (e.message.includes('error trying to load')) {
      firebaseRC = null;
    } else {
      pluginLogger.error(e.message);
      throw e;
    }
  }
  try {
    firebaseJSON = Config.load({ configPath: path.join(configPath, 'firebase.json') });
  }
  catch (e) {
    if (e.message.includes('could not locate')
      || e.message.includes('Could not load config file')) {
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
  context: vscode.ExtensionContext) {
  const { firebaseJSON, firebaseRC } = readFirebaseConfigs(context);
  broker.send("notifyFirebaseConfig",
    {
      firebaseJson: firebaseJSON?.data, firebaseRC: firebaseRC?.data
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
  if (!currentOptions.rc) {
    if (!currentOptions.cwd) {
      currentOptions.cwd = getConfigPath();
    }
    currentOptions.rc = new RC(path.join(currentOptions.cwd, ".firebaserc"),
      {});
  }
  currentOptions.rc.addProjectAlias(alias, projectId);
  currentOptions.rc.save();
  updateOptions(context, undefined, currentOptions.rc);
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
    if (!currentOptions.cwd) {
      return null;
    }

    let watcher = workspace.createFileSystemWatcher(
      path.join(currentOptions.cwd, "{firebase.json,.firebaserc}")
    );
    watcher.onDidChange(async () => {
      readAndSendFirebaseConfigs(broker, context);
    });
    return watcher;
  }
}
