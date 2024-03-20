import { ResolvedDataConnectConfigs } from "../messaging/protocol";
import { computed } from "@preact/signals-core";
import { dataConnectConfigs } from "../core/config";
import { isPathInside } from "./file-utils";
export * from "../core/config";

export function getEnclosingService(
  filePath: string,
  configs: ResolvedDataConnectConfigs,
) {
  return configs.find((dc) =>
    dc.resolvedConnectors.find((connector) =>
      isPathInside(filePath, connector.path),
    ),
  );
}

export function serviceIds() {
  return computed(() => {
    const configs = dataConnectConfigs.valueOf();
    return configs.map((config) => config.serviceId);
  });
}
export function getConnectorYamls(serviceId: string) {
  return computed(() => {
    const configs = dataConnectConfigs.valueOf();
    return configs.find((config) => config.serviceId === serviceId)
      .resolvedConnectors;
  });
}
export function getConnectorIds(serviceId: string) {
  return computed(() => {
    const yamls = getConnectorYamls(serviceId).valueOf();
    return yamls.map((yaml) => yaml.connectorId);
  });
}
