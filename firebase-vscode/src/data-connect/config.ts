import { isPathInside } from "./file-utils";
import { DeepReadOnly } from "../metaprogramming";
import { ConnectorYaml, DataConnectYaml } from "../dataconnect/types";
import { Result, ResultValue } from "../result";
import { computed, effect, signal } from "@preact/signals-core";
import {
  _createWatcher as createWatcher,
  firebaseConfig,
  getConfigPath,
} from "../core/config";
import * as vscode from "vscode";
import * as promise from "../utils/promise";
import {
  readConnectorYaml,
  readDataConnectYaml,
  readFirebaseJson as readFdcFirebaseJson,
} from "../../../src/dataconnect/fileUtils";
import { Config } from "../config";
import { DataConnectMultiple } from "../firebaseConfig";
import path from "path";
import { ExtensionBrokerImpl } from "../extension-broker";

export * from "../core/config";

export const dataConnectConfigs = signal<
  Result<ResolvedDataConnectConfigs | undefined> | undefined
>(undefined);

export function registerDataConnectConfigs(
  broker: ExtensionBrokerImpl,
): vscode.Disposable {
  let cancel: () => void | undefined;

  function handleResult(
    firebaseConfig: Result<Config | undefined> | undefined,
  ) {
    cancel?.();
    cancel = undefined;

    // While waiting for the promise to resolve, we clear the configs, to tell anything that depends
    // on it that it's loading.
    dataConnectConfigs.value = undefined;

    const configs = firebaseConfig?.followAsync(
      async (config) =>
        new ResultValue(
          await _readDataConnectConfigs(readFdcFirebaseJson(config)),
        ),
    );

    cancel =
      configs &&
      promise.cancelableThen(
        configs,
        (configs) => (dataConnectConfigs.value = configs.tryReadValue),
      ).cancel;
  }

  const sub = effect(() => handleResult(firebaseConfig.value));

  const dataConnectWatcher = createWatcher("**/{dataconnect,connector}.yaml");
  dataConnectWatcher?.onDidChange(() => handleResult(firebaseConfig.value));
  dataConnectWatcher?.onDidCreate(() => handleResult(firebaseConfig.value));
  dataConnectWatcher?.onDidDelete(() => handleResult(undefined));
  // TODO watch connectors

  const hasConfigs = computed(() => !!dataConnectConfigs.value?.tryReadValue?.values.length);

  const hasConfigSub = effect(() => {
    broker.send("notifyHasFdcConfigs", hasConfigs.value);
  });
  const getInitialHasFdcConfigsSub = broker.on("getInitialHasFdcConfigs", () => {
    broker.send("notifyHasFdcConfigs", hasConfigs.value);
  });

  return vscode.Disposable.from(
    { dispose: sub },
    { dispose: hasConfigSub },
    { dispose: getInitialHasFdcConfigsSub },
    { dispose: () => cancel?.() },
    dataConnectWatcher,
  );
}

/** @internal */
export async function _readDataConnectConfigs(
  fdcConfig: DataConnectMultiple,
): Promise<Result<ResolvedDataConnectConfigs | undefined>> {
  return Result.guard(async () => {
    const dataConnects = await Promise.all(
      fdcConfig.map<Promise<ResolvedDataConnectConfig>>(async (dataConnect) => {
        // Paths may be relative to the firebase.json file.
        const absoluteLocation = asAbsolutePath(
          dataConnect.source,
          getConfigPath(),
        );
        const dataConnectYaml = await readDataConnectYaml(absoluteLocation);
        const resolvedConnectors = await Promise.all(
          dataConnectYaml.connectorDirs.map((connectorDir) =>
            Result.guard(async () => {
              const connectorYaml = await readConnectorYaml(
                // Paths may be relative to the dataconnect.yaml
                asAbsolutePath(connectorDir, absoluteLocation),
              );
              return new ResolvedConnectorYaml(
                asAbsolutePath(connectorDir, absoluteLocation),
                connectorYaml,
              );
            }),
          ),
        );
        return new ResolvedDataConnectConfig(
          absoluteLocation,
          dataConnectYaml,
          resolvedConnectors,
          dataConnectYaml.location,
        );
      }),
    );
    return new ResolvedDataConnectConfigs(dataConnects);
  });
}

function asAbsolutePath(relativePath: string, from: string): string {
  return path.normalize(path.join(from, relativePath));
}

export class ResolvedConnectorYaml {
  constructor(
    readonly path: string,
    readonly value: DeepReadOnly<ConnectorYaml>
  ) {}

  containsPath(path: string) {
    return isPathInside(path, this.path);
  }
}

export class ResolvedDataConnectConfig {
  constructor(
    readonly path: string,
    readonly value: DeepReadOnly<DataConnectYaml>,
    readonly resolvedConnectors: Result<ResolvedConnectorYaml>[],
    readonly dataConnectLocation: string,
  ) {}

  get connectorIds(): string[] {
    const result: string[] = [];

    for (const connector of this.resolvedConnectors) {
      const id = connector.tryReadValue?.value.connectorId;
      if (id) {
        result.push(id);
      }
    }

    return result;
  }

  get connectorDirs(): string[] {
    return this.value.connectorDirs;
  }

  get schemaDir(): string {
    return this.value.schema.source;
  }

  get relativePath(): string {
    return this.path.split("/").pop();
  }

  get relativeSchemaPath(): string {
    return this.schemaDir.replace(".", this.relativePath);
  }

  get relativeConnectorPaths(): string[] {
    return this.connectorDirs.map((connectorDir) => connectorDir.replace(".", this.relativePath));
  }

  findConnectorById(connectorId: string): ResolvedConnectorYaml {
    return this.resolvedConnectors.find(
      (connector) => connector.tryReadValue.value.connectorId === connectorId,
    ).tryReadValue;
  }

  containsPath(path: string) {
    return isPathInside(path, this.path);
  }

  findEnclosingConnectorForPath(filePath: string) {
    return this.resolvedConnectors.find(
      (connector) => connector.tryReadValue?.containsPath(filePath) ?? false,
    );
  }
}

/** The fully resolved `dataconnect.yaml` and its connectors */
export class ResolvedDataConnectConfigs {
  constructor(readonly values: DeepReadOnly<ResolvedDataConnectConfig[]>) {}

  get serviceIds() {
    return this.values.map((config) => config.value.serviceId);
  }

  get allConnectors() {
    return this.values.flatMap((dc) => dc.resolvedConnectors);
  }

  findById(serviceId: string) {
    return this.values.find((dc) => dc.value.serviceId === serviceId);
  }

  findEnclosingServiceForPath(filePath: string) {
    return this.values.find((dc) => dc.containsPath(filePath));
  }

  getApiServicePathByPath(projectId: string, path: string) {
    const dataConnectConfig = this.findEnclosingServiceForPath(path);
    const serviceId = dataConnectConfig.value.serviceId;
    const locationId = dataConnectConfig.dataConnectLocation;

    return `projects/${projectId}/locations/${locationId}/services/${serviceId}`;
  }
}

// TODO: Expand this into a VSCode env config object/class
export enum VSCODE_ENV_VARS {
  DATA_CONNECT_ORIGIN = "FIREBASE_DATACONNECT_URL",
}
