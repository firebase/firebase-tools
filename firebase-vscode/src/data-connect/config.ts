import { isPathInside } from "./file-utils";
import { DeepReadOnly } from "../metaprogramming";
import { ConnectorYaml, DataConnectYaml } from "../dataconnect/types";
export * from "../core/config";

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

  get connectorIds() {
    return this.resolvedConnectors.map(
      (connector) => connector.value.connectorId,
    );
  }

  containsPath(path: string) {
    return isPathInside(path, this.path);
  }

  findEnclosingConnectorForPath(filePath: string) {
    return this.resolvedConnectors.find((connector) =>
      connector.containsPath(filePath),
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

  getApiServicePathByPath(
    projectId: string,
    path: string,
    resolvedDataConnectConfigs: ResolvedDataConnectConfigs,
  ) {
    const dataConnectConfig =
      resolvedDataConnectConfigs.findEnclosingServiceForPath(path);
    const serviceId = dataConnectConfig.value.serviceId;
    const locationId = dataConnectConfig.dataConnectLocation;

    return `projects/${projectId}/locations/${locationId}/services/${serviceId}`;
  }
}

// TODO: Expand this into a VSCode env config object/class
export enum VSCODE_ENV_VARS {
  DATA_CONNECT_ORIGIN = "FIREBASE_DATACONNECT_URL",
  POSTGRES_CONNECTION_STRING = "FIREBASE_DATACONNECT_POSTGRESQL_STRING",
}