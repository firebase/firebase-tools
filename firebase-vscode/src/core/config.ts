import { Disposable, FileSystemWatcher } from "vscode";
import * as vscode from "vscode";
import path from "path";
import fs from "fs";
import { currentOptions } from "../options";
import { pluginLogger } from "../logger-wrapper";
import { ExtensionBrokerImpl } from "../extension-broker";
import { RC } from "../../../src/rc";
import { Config } from "../../../src/config";
import { globalSignal } from "../utils/globals";
import { workspace } from "../utils/test_hooks";
import { DataConnectConfig } from "../../common/messaging/protocol";
import * as jsYaml from "js-yaml";

export const firebaseRC = globalSignal<RC | undefined>(undefined);
export const firebaseConfig = globalSignal<Config | undefined>(undefined);
export const dataConnectConfig = globalSignal<DataConnectConfig | undefined>(undefined);

export function registerConfig(broker: ExtensionBrokerImpl): Disposable {
  firebaseRC.value = _readRC();
  firebaseConfig.value = _readFirebaseConfig();
  dataConnectConfig.value = _readDataConnectConfig();

  function notifyFirebaseConfig() {
    broker.send("notifyFirebaseConfig", {
      firebaseJson: firebaseConfig.value?.data,
      firebaseRC: firebaseRC.value?.data,
    });
  }

  // "subscribe" immediately calls the callback with the current value.
  // We want to skip this.
  var shouldNotify = false;

  // When configs change, notify the extension.
  // We do so after the config is initially updated, to not notify
  // the extension on startup.
  const rcRemoveListener = firebaseRC.subscribe(() => {
    if (!shouldNotify) {
      return;
    }
    return notifyFirebaseConfig();
  });
  const firebaseConfigRemoveListener = firebaseConfig.subscribe(() => {
    if (!shouldNotify) {
      return;
    }
    return notifyFirebaseConfig();
  });

  shouldNotify = true;

  // On getInitialData, forcibly notifies the extension.
  const getInitialDataRemoveListener = broker.on(
    "getInitialData",
    notifyFirebaseConfig,
  );

  const rcWatcher = _createWatcher(".firebaserc");
  rcWatcher?.onDidChange(() => (firebaseRC.value = _readRC()));
  rcWatcher?.onDidCreate(() => (firebaseRC.value = _readRC()));
  // TODO handle deletion of .firebaserc/.firebase.json/firemat.yaml

  const configWatcher = _createWatcher("firebase.json");
  configWatcher?.onDidChange(
    () => (firebaseConfig.value = _readFirebaseConfig()),
  );
  configWatcher?.onDidCreate(
    () => (firebaseConfig.value = _readFirebaseConfig()),
  );

  const dataConnectWatcher = _createWatcher("firemat.yaml");
  dataConnectWatcher?.onDidChange(
    () => (dataConnectConfig.value = _readDataConnectConfig()),
  );
  dataConnectWatcher?.onDidCreate(
    () => (dataConnectConfig.value = _readDataConnectConfig()),
  );

  return {
    dispose: () => {
      getInitialDataRemoveListener();
      rcRemoveListener();
      firebaseConfigRemoveListener();
      dataConnectWatcher?.dispose();
      rcWatcher?.dispose();
      configWatcher?.dispose();
    },
  };
}

const defaultDataConnectConfig: DataConnectConfig = {
  specVersion: "v1alpha",
  schema: {
    main: {
      source: "./dataconnect/schema",
      connection: {
        connectionString: undefined,
      },
    },
  },
  operationSet: {
    crud: {
      source: "./dataconnect/connector",
    },
  },
  adhoc: "./dataconnect", // TODO: Temporary until official data connect yaml
};

const value = 42;
const typeOfValue = typeof value;
/** All the possible values for "typeof", as a TS union. */
type TypeOf = typeof typeOfValue;

/** The TS type for a given "typeof" value */
type ValueOf<T extends TypeOf> = T extends "string"
  ? string
  : T extends "number"
    ? number
    : T extends "bigint"
      ? bigint
      : T extends "boolean"
        ? boolean
        : T extends "symbol"
          ? symbol
          : T extends "undefined"
            ? undefined
            : T extends "object"
              ? object
              : T extends "function"
                ? Function
                : never;

function assignIfType<T extends TypeOf>(
  type: T,
  path: string,
  value: unknown,
): T | undefined;
function assignIfType<T extends TypeOf>(
  type: T,
  path: string,
  value: unknown,
  fallback: ValueOf<T>,
): T;
function assignIfType<T extends TypeOf>(
  type: T,
  path: string,
  value: unknown,
  fallback?: T,
): T | undefined {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === type) {
    return value as T;
  }

  throw new Error(
    `Expected field at ${path} to be of type ${type} but got ${typeof value}`,
  );
}

function asAbsolutePath(relativePath: string, from: string): string {
  return path.normalize(path.join(from, relativePath));
}

/** @internal */
export function _readDataConnectConfig(): DataConnectConfig | undefined {
  // TODO refactor parsing as soon as firemat.yaml syntax is changed
  const configPath = _getConfigPath();
  if (!configPath) {
    return undefined;
  }

  try {
    const dataConnectYaml = fs.readFileSync(
      path.join(configPath, "firemat.yaml"),
      "utf-8",
    );
    const yaml = jsYaml.load(dataConnectYaml);

    let operations: Record<string, DataConnectConfig["operationSet"][string]> = {};

    const operationSet =
      yaml?.operationSet ?? defaultDataConnectConfig.operationSet;
    for (const key of Object.keys(operationSet)) {
      operations[key] = {
        source: asAbsolutePath(
          assignIfType(
            "string",
            `firemat.yaml#operationSet.${key}.source`,
            operationSet[key]?.source,
            defaultDataConnectConfig.operationSet[key]?.source,
          ),
          configPath,
        ),
      };
    }

    return {
      specVersion: assignIfType(
        "string",
        "firemat.yaml#specVersion",
        yaml?.specVersion,
        defaultDataConnectConfig.specVersion,
      ),
      schema: {
        main: {
          source: asAbsolutePath(
            assignIfType(
              "string",
              "firemat.yaml#schema.main.source",
              yaml?.schema?.main?.source,
              defaultDataConnectConfig.schema.main.source,
            ),
            configPath,
          ),
          connection: {
            connectionString: assignIfType(
              "string",
              "firemat.yaml#schema.main.connection.connectionString",
              yaml?.schema?.main?.connection?.connectionString,
            ),
          },
        },
      },
      operationSet: operations,
      adhoc: configPath + "/dataconnect", // TODO: Temporary until official data connect yaml
    };
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return undefined;
    }

    pluginLogger.error(e);
    throw e;
  }
}

/** @internal */
export function _readRC(): RC | undefined {
  const configPath = _getConfigPath();
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
  const configPath = _getConfigPath();
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

/** @internal */
export function _getConfigPath(): string | undefined {
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

  currentOptions.value.cwd = folder;
  return folder;
}
