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
import { ValueOrError } from "../../common/messaging/protocol";
import { firstWhereDefined, onChange } from "../utils/signal";
import { Result, ResultError, ResultValue } from "../result";
import { FirebaseConfig } from "../firebaseConfig";
import { computed, effect } from "@preact/signals-react";

const allFirebaseConfigsUris = globalSignal<Array<vscode.Uri>>([]);

const selectedFirebaseConfigUri = globalSignal<vscode.Uri | undefined>(
  undefined,
);

/**
 * The firebase.json configs.
 *
 * `undefined` means that the extension has yet to load the file.
 * {@link ResultValue} with an `undefined` value means that the file was not found.
 * {@link ResultError} means that the file was found but the parsing failed.
 *
 * This enables the UI to differentiate between "no config" and "error reading config",
 * and also await for configs to be loaded (thanks to the {@link firstWhereDefined} util)
 */
export const firebaseConfig = globalSignal<
  Result<Config | undefined> | undefined
>(undefined);

const selectedRCUri = computed(() => {
  const configUri = selectedFirebaseConfigUri.value;
  if (!configUri) {
    return undefined;
  }

  const folderPath = path.dirname(configUri.fsPath);
  return vscode.Uri.file(path.join(folderPath, ".firebaserc"));
});

/**
 * The .firebaserc configs.
 *
 * `undefined` means that the extension has yet to load the file.
 * {@link ResultValue} with an `undefined` value means that the file was not found.
 * {@link ResultError} means that the file was found but the parsing failed.
 *
 * This enables the UI to differentiate between "no config" and "error reading config",
 * and also await for configs to be loaded (thanks to the {@link firstWhereDefined} util)
 */
export const firebaseRC = globalSignal<Result<RC | undefined> | undefined>(
  undefined,
);

/**
 * Write new default project to .firebaserc
 */
export async function updateFirebaseRCProject(values: {
  projectAlias?: {
    alias: string;
    projectId: string;
  };
}) {
  let didChange = false;
  const newRCPath = path.join(currentOptions.value.cwd, ".firebaserc");
  const isNewRC = !firebaseRC.value?.tryReadValue;

  const rc = firebaseRC.value?.tryReadValue ?? new RC(newRCPath, {});

  if (
    values.projectAlias &&
    rc.resolveAlias(values.projectAlias.alias) !== values.projectAlias.projectId
  ) {
    rc.addProjectAlias(
      values.projectAlias.alias,
      values.projectAlias.projectId,
    );
    rc.save();
    if (isNewRC) {
      firebaseRC.value = _readRC(vscode.Uri.file(newRCPath));
    }
  }
}

function notifyFirebaseConfig(broker: ExtensionBrokerImpl) {
  broker.send("notifyFirebaseConfig", {
    firebaseJson: firebaseConfig.value?.switchCase<
      ValueOrError<FirebaseConfig | undefined> | undefined
    >(
      (value) => ({ value: value?.data, error: undefined }),
      (error) => ({ value: undefined, error: `${error}` }),
    ),
    firebaseRC: firebaseRC.value?.switchCase<
      ValueOrError<RCData | undefined> | undefined
    >(
      (value) => ({
        value: value?.data,
        error: undefined,
      }),
      (error) => ({ value: undefined, error: `${error}` }),
    ),
  });
}

function displayStringForUri(uri: vscode.Uri) {
  return vscode.workspace.asRelativePath(uri);
}

function notifyFirebaseConfigListChanged(broker: ExtensionBrokerImpl) {
  broker.send("notifyFirebaseConfigListChanged", {
    values: allFirebaseConfigsUris.value.map(displayStringForUri),
    selected: selectedFirebaseConfigUri.value
      ? displayStringForUri(selectedFirebaseConfigUri.value)
      : undefined,
  });
}

async function registerRc(
  context: vscode.ExtensionContext,
  broker: ExtensionBrokerImpl,
) {
  context.subscriptions.push({
    dispose: effect(() => {
      firebaseRC.value = undefined;

      const rcUri = selectedRCUri.value;
      if (!rcUri) {
        return;
      }

      const watcher = workspace.value.createFileSystemWatcher(rcUri.fsPath);

      watcher.onDidChange(() => (firebaseRC.value = _readRC(rcUri)));
      watcher.onDidCreate(() => (firebaseRC.value = _readRC(rcUri)));
      // TODO handle deletion of .firebaserc/.firebase.json/firemat.yaml
      watcher.onDidDelete(() => (firebaseRC.value = undefined));

      firebaseRC.value = _readRC(rcUri);

      return () => {
        watcher.dispose();
      };
    }),
  });

  context.subscriptions.push({
    dispose: onChange(firebaseRC, () => notifyFirebaseConfig(broker)),
  });

  context.subscriptions.push({
    dispose: effect(() => {
      const rc = firebaseRC.value;
      if (rc instanceof ResultError) {
        vscode.window.showErrorMessage(
          `Error reading .firebaserc:\n${rc.error}`,
        );
      }
    }),
  });
}

async function registerFirebaseConfig(
  context: vscode.ExtensionContext,
  broker: ExtensionBrokerImpl,
) {
  const firebaseJsonPattern = "**/firebase.json";
  allFirebaseConfigsUris.value = await findFiles(firebaseJsonPattern);

  const configWatcher = await _createWatcher(firebaseJsonPattern);
  // Track the URI of any firebase.json in the project.
  if (configWatcher) {
    context.subscriptions.push(configWatcher);

    // We don't listen to changes here, as we'll only watch the selected config.
    configWatcher.onDidCreate((addedUri) => {
      allFirebaseConfigsUris.value = [
        ...allFirebaseConfigsUris.value,
        addedUri,
      ];
    });
    configWatcher.onDidDelete((deletedUri) => {
      allFirebaseConfigsUris.value = allFirebaseConfigsUris.value.filter(
        (uri) => uri.fsPath !== deletedUri.fsPath,
      );
    });
  }

  context.subscriptions.push({
    dispose: onChange(firebaseConfig, () => notifyFirebaseConfig(broker)),
  });

  // When no config is selected, or the selected config is deleted, select the first one.
  context.subscriptions.push({
    dispose: effect(() => {
      const configUri = selectedFirebaseConfigUri.value;
      // We watch all config URIs before selecting one, so that when deleting the selected
      // config, the effect runs again and selects a new one.
      const allConfigUris = allFirebaseConfigsUris.value;
      if (configUri && fs.existsSync(configUri.fsPath)) {
        return;
      }

      if (allConfigUris[0] !== selectedFirebaseConfigUri.value) {
        selectedFirebaseConfigUri.value = allConfigUris[0];
      }
    }),
  });

  let disposable: Disposable | undefined;
  context.subscriptions.push({ dispose: () => disposable?.dispose() });
  context.subscriptions.push({
    dispose: effect(() => {
      disposable?.dispose();
      disposable = undefined;
      firebaseRC.value = undefined;

      const configUri = selectedFirebaseConfigUri.value;
      if (!configUri) {
        return;
      }

      disposable = configWatcher?.onDidChange((uri) => {
        // ignore changes from firebase.json files that are not the selected one
        if (uri.fsPath !== configUri.fsPath) {
          firebaseConfig.value = _readFirebaseConfig(configUri);
        }
      });

      firebaseConfig.value = _readFirebaseConfig(configUri);
    }),
  });

  // Bind the list of URIs to webviews
  context.subscriptions.push({
    dispose: effect(() => {
      // Listen to changes
      allFirebaseConfigsUris.value;
      selectedFirebaseConfigUri.value;

      notifyFirebaseConfigListChanged(broker);
    }),
  });
  context.subscriptions.push({
    dispose: broker.on("getInitialFirebaseConfigList", () => {
      notifyFirebaseConfigListChanged(broker);
    }),
  });
  context.subscriptions.push({
    dispose: broker.on("selectFirebaseConfig", (uri) => {
      selectedFirebaseConfigUri.value = allFirebaseConfigsUris.value.find(
        (u) => displayStringForUri(u) === uri,
      );
    }),
  });
}

export async function registerConfig(
  context: vscode.ExtensionContext,
  broker: ExtensionBrokerImpl,
) {
  // On getInitialData, forcibly notifies the extension.
  context.subscriptions.push({
    dispose: broker.on("getInitialData", () => {
      notifyFirebaseConfig(broker);
    }),
  });

  // Register configs before RC as the path to RC depends on the path to configs.
  await registerFirebaseConfig(context, broker);
  await registerRc(context, broker);
}

/** @internal */
export function _readRC(uri: vscode.Uri): Result<RC | undefined> {
  return Result.guard(() => {
    // RC.loadFile silences errors and returns a non-empty object if the rc file is
    // missing. Let's load it ourselves.

    if (!fs.existsSync(uri.fsPath)) {
      return undefined;
    }

    const json = fs.readFileSync(uri.fsPath);
    const data = JSON.parse(json.toString());

    return new RC(uri.fsPath, data);
  });
}

/** @internal */
export function _readFirebaseConfig(
  uri: vscode.Uri,
): Result<Config | undefined> | undefined {
  const result = Result.guard(() => {
    const config = Config.load({ configPath: uri.fsPath });
    if (!config) {
      // Config.load may return null. We transform it to undefined.
      return undefined;
    }

    return config;
  });

  if (result instanceof ResultError && (result.error as any).status === 404) {
    return undefined;
  }

  return result;
}

/** @internal */
export async function _createWatcher(
  file: string,
): Promise<FileSystemWatcher | undefined> {
  const cwdSignal = computed(() => currentOptions.value.cwd);
  const cwd = await firstWhereDefined(cwdSignal);

  return workspace.value.createFileSystemWatcher(
    // Using RelativePattern enables tests to use watchers too.
    new vscode.RelativePattern(vscode.Uri.file(cwd), file),
  );
}

async function findFiles(file: string) {
  return workspace.value.findFiles(file, "**/node_modules");
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
