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
import { ResolvedDataConnectConfigs } from "../data-connect/config";
import { ValueOrError } from "../../common/messaging/protocol";
import { firstWhereDefined, onChange } from "../utils/signal";
import { Result, ResultError, ResultValue } from "../result";
import { FirebaseConfig } from "../firebaseConfig";
import { effect } from "@preact/signals-react";

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

export const dataConnectConfigs = globalSignal<
  ResolvedDataConnectConfigs | undefined
>(undefined);

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

/**
 * Write new default project to .firebaserc
 */
export async function updateFirebaseRCProject(values: {
  fdcPostgresConnectionString?: string;
  projectAlias?: {
    alias: string;
    projectId: string;
  };
}) {
  const rc =
    firebaseRC.value?.tryReadValue ??
    // We don't update firebaseRC if we create a temporary RC,
    // as the file watcher will update the value for us.
    // This is only for the sake of calling `save()`.
    new RC(path.join(currentOptions.value.cwd, ".firebaserc"), {});

  if (values.projectAlias) {
    if (
      rc.resolveAlias(values.projectAlias.alias) ===
      values.projectAlias.projectId
    ) {
      // Nothing to update, avoid an unnecessary write.
      // That's especially important as a write will trigger file watchers,
      // which may then re-trigger this function.
      return;
    }

    rc.addProjectAlias(
      values.projectAlias.alias,
      values.projectAlias.projectId,
    );
  }

  rc.save();
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

function registerRc(broker: ExtensionBrokerImpl): Disposable {
  firebaseRC.value = _readRC();
  const rcRemoveListener = onChange(firebaseRC, () =>
    notifyFirebaseConfig(broker),
  );

  const showToastOnError = effect(() => {
    const rc = firebaseRC.value;
    if (rc instanceof ResultError) {
      vscode.window.showErrorMessage(`Error reading .firebaserc:\n${rc.error}`);
    }
  });

  const rcWatcher = _createWatcher(".firebaserc");
  rcWatcher?.onDidChange(() => (firebaseRC.value = _readRC()));
  rcWatcher?.onDidCreate(() => (firebaseRC.value = _readRC()));
  // TODO handle deletion of .firebaserc/.firebase.json/firemat.yaml
  rcWatcher?.onDidDelete(() => (firebaseRC.value = undefined));

  return Disposable.from(
    { dispose: rcRemoveListener },
    { dispose: showToastOnError },
    { dispose: () => rcWatcher?.dispose() },
  );
}

function registerFirebaseConfig(broker: ExtensionBrokerImpl): Disposable {
  firebaseConfig.value = _readFirebaseConfig();

  const firebaseConfigRemoveListener = onChange(firebaseConfig, () =>
    notifyFirebaseConfig(broker),
  );

  const showToastOnError = effect(() => {
    const config = firebaseConfig.value;
    if (config instanceof ResultError) {
      vscode.window.showErrorMessage(
        `Error reading firebase.json:\n${config.error}`,
      );
    }
  });

  const configWatcher = _createWatcher("firebase.json");
  configWatcher?.onDidChange(
    () => (firebaseConfig.value = _readFirebaseConfig()),
  );
  configWatcher?.onDidCreate(
    () => (firebaseConfig.value = _readFirebaseConfig()),
  );
  configWatcher?.onDidDelete(() => (firebaseConfig.value = undefined));

  return Disposable.from(
    { dispose: firebaseConfigRemoveListener },
    { dispose: showToastOnError },
    { dispose: () => configWatcher?.dispose() },
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
    registerRc(broker),
  );
}

/** @internal */
export function _readRC(): Result<RC | undefined> {
  return Result.guard(() => {
    const configPath = getConfigPath();
    if (!configPath) {
      return undefined;
    }
    // RC.loadFile silences errors and returns a non-empty object if the rc file is
    // missing. Let's load it ourselves.

    const rcPath = path.join(configPath, ".firebaserc");

    if (!fs.existsSync(rcPath)) {
      return undefined;
    }

    const json = fs.readFileSync(rcPath);
    const data = JSON.parse(json.toString());

    return new RC(rcPath, data);
  });
}

/** @internal */
export function _readFirebaseConfig(): Result<Config | undefined> | undefined {
  const result = Result.guard(() => {
    const configPath = getConfigPath();
    if (!configPath) {
      return undefined;
    }
    const config = Config.load({
      configPath: path.join(configPath, "firebase.json"),
    });
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
export function _createWatcher(file: string): FileSystemWatcher | undefined {
  if (!currentOptions.value.cwd) {
    return undefined;
  }

  return workspace.value?.createFileSystemWatcher(
    // Using RelativePattern enables tests to use watchers too.
    new vscode.RelativePattern(vscode.Uri.file(currentOptions.value.cwd), file),
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
