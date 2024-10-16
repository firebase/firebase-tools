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
import * as fs from "fs";

export * from "../core/config";

export type DataConnectConfigsValue = ResolvedDataConnectConfigs | undefined;
export type DataConnectConfigsError = {
  path?: string;
  error: Error | unknown;
  range: vscode.Range;
};

export const dataConnectConfigs = signal<
  | Result<DataConnectConfigsValue | undefined, DataConnectConfigsError>
  | undefined
>(undefined);

export class ErrorWithPath extends Error {
  constructor(
    readonly path: string,
    readonly error: unknown,
    readonly range: vscode.Range,
  ) {
    super(error instanceof Error ? error.message : `${error}`);
  }
}

export async function registerDataConnectConfigs(
  context: vscode.ExtensionContext,
  broker: ExtensionBrokerImpl,
) {
  function handleResult(
    firebaseConfig: Result<Config | undefined> | undefined,
  ): undefined | (() => void) {
    // While waiting for the promise to resolve, we clear the configs, to tell anything that depends
    // on it that it's loading.
    dataConnectConfigs.value = undefined;

    const configs = firebaseConfig?.followAsync<
      ResolvedDataConnectConfigs | undefined,
      DataConnectConfigsError
    >(
      async (config) => {
        const configs = await _readDataConnectConfigs(
          readFdcFirebaseJson(config),
        );

        return new ResultValue<
          ResolvedDataConnectConfigs | undefined,
          DataConnectConfigsError
        >(configs.requireValue);
      },
      (err) => {
        if (err instanceof ErrorWithPath) {
          return { path: err.path, error: err.error, range: err.range };
        }
        return {
          path: undefined,
          error: err,
          range: new vscode.Range(0, 0, 0, 0),
        };
      },
    );

    const operation =
      configs &&
      promise.cancelableThen(configs, (configs) => {
        return (dataConnectConfigs.value = configs);
      });

    return operation?.cancel;
  }

  context.subscriptions.push({
    dispose: effect(() => handleResult(firebaseConfig.value)),
  });

  const dataConnectWatcher = await createWatcher(
    "**/{dataconnect,connector}.yaml",
  );
  if (dataConnectWatcher) {
    context.subscriptions.push(dataConnectWatcher);

    dataConnectWatcher.onDidChange(() => handleResult(firebaseConfig.value));
    dataConnectWatcher.onDidCreate(() => handleResult(firebaseConfig.value));
    dataConnectWatcher.onDidDelete(() => handleResult(firebaseConfig.value));
  }

  const hasConfigs = computed(
    () => !!dataConnectConfigs.value?.tryReadValue?.values.length,
  );

  context.subscriptions.push({
    dispose: effect(() => {
      broker.send("notifyHasFdcConfigs", hasConfigs.value);
    }),
  });

  context.subscriptions.push({
    dispose: broker.on("getInitialHasFdcConfigs", () => {
      broker.send("notifyHasFdcConfigs", hasConfigs.value);
    }),
  });
}

/** @internal */
export async function _readDataConnectConfigs(
  fdcConfig: DataConnectMultiple,
): Promise<Result<ResolvedDataConnectConfigs | undefined>> {
  async function mapConnector(connectorDirPath: string) {
    const connectorYaml = await readConnectorYaml(connectorDirPath).catch(
      (err: unknown) => {
        const connectorPath = path.normalize(
          path.join(connectorDirPath, "connector.yaml"),
        );
        throw new ErrorWithPath(
          connectorPath,
          err,
          new vscode.Range(0, 0, 0, 0),
        );
      },
    );

    return new ResolvedConnectorYaml(connectorDirPath, connectorYaml);
  }

  async function mapDataConnect(absoluteLocation: string) {
    const dataConnectYaml = await readDataConnectYaml(absoluteLocation);
    const connectorDirs = dataConnectYaml.connectorDirs;
    if (!Array.isArray(connectorDirs)) {
      throw new ErrorWithPath(
        path.join(absoluteLocation, "dataconnect.yaml"),
        `Expected 'connectorDirs' to be an array, but got ${connectorDirs}`,
        // TODO(rrousselGit): Decode Yaml using AST to have the error message point to the `connectorDirs:` line
        new vscode.Range(0, 0, 0, 0),
      );
    }

    const resolvedConnectors = await Promise.all(
      connectorDirs.map((relativeConnector) => {
        const absoluteConnector = asAbsolutePath(
          relativeConnector,
          absoluteLocation,
        );
        const connectorPath = path.join(absoluteConnector, "connector.yaml");
        try {
          // Check if the file exists
          if (!fs.existsSync(connectorPath)) {
            throw new ErrorWithPath(
              path.join(absoluteLocation, "dataconnect.yaml"),
              `No connector.yaml found at ${relativeConnector}`,
              // TODO(rrousselGit): Decode Yaml using AST to have the error message point to the `connectorDirs:` line
              new vscode.Range(0, 0, 0, 0),
            );
          }

          return mapConnector(absoluteConnector);
        } catch (error) {
          if (error instanceof ErrorWithPath) {
            throw error;
          }

          throw new ErrorWithPath(
            connectorPath,
            error,
            new vscode.Range(0, 0, 0, 0),
          );
        }
      }),
    );

    return new ResolvedDataConnectConfig(
      absoluteLocation,
      dataConnectYaml,
      resolvedConnectors,
      dataConnectYaml.location,
    );
  }

  return Result.guard(async () => {
    const dataConnects = await Promise.all(
      fdcConfig
        // Paths may be relative to the firebase.json file.
        .map((relative) => asAbsolutePath(relative.source, getConfigPath()!))
        .map(async (absolutePath) => {
          try {
            return await mapDataConnect(absolutePath);
          } catch (error) {
            if (error instanceof ErrorWithPath) {
              throw error;
            }

            throw new ErrorWithPath(
              path.join(absolutePath, "dataconnect.yaml"),
              error,
              new vscode.Range(0, 0, 0, 0),
            );
          }
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
    readonly value: DeepReadOnly<ConnectorYaml>,
  ) {}

  containsPath(path: string) {
    return isPathInside(path, this.path);
  }
}

export class ResolvedDataConnectConfig {
  constructor(
    readonly path: string,
    readonly value: DeepReadOnly<DataConnectYaml>,
    readonly resolvedConnectors: ResolvedConnectorYaml[],
    readonly dataConnectLocation: string,
  ) {}

  get connectorIds(): string[] {
    const result: string[] = [];

    for (const connector of this.resolvedConnectors) {
      const id = connector.value.connectorId;
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
    return this.path.split("/").pop()!;
  }

  get relativeSchemaPath(): string {
    return this.schemaDir.replace(".", this.relativePath);
  }

  get relativeConnectorPaths(): string[] {
    return this.connectorDirs.map((connectorDir) =>
      connectorDir.replace(".", this.relativePath),
    );
  }

  findConnectorById(connectorId: string): ResolvedConnectorYaml | undefined {
    return this.resolvedConnectors.find(
      (connector) => connector.value.connectorId === connectorId,
    );
  }

  containsPath(path: string) {
    return isPathInside(path, this.path);
  }

  findEnclosingConnectorForPath(filePath: string) {
    return this.resolvedConnectors.find(
      (connector) => connector?.containsPath(filePath) ?? false,
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
    const serviceId = dataConnectConfig?.value.serviceId;
    const locationId = dataConnectConfig?.dataConnectLocation;
    return `projects/${projectId}/locations/${locationId}/services/${serviceId}`;
  }
}

// TODO: Expand this into a VSCode env config object/class
export enum VSCODE_ENV_VARS {
  DATA_CONNECT_ORIGIN = "FIREBASE_DATACONNECT_URL",
}
