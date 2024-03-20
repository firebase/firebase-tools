import vscode, { Uri } from "vscode";
import { ResolvedDataConnectConfigs } from "../messaging/protocol";
import path from "path";
import { computed } from "@preact/signals-core";
import { dataConnectConfigs } from "../core/config";
export async function checkIfFileExists(file: Uri) {
  try {
    await vscode.workspace.fs.stat(file);
    return true;
  } catch {
    return false;
  }
}

export function isPathInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function getEnclosingService(filePath: string, configs: ResolvedDataConnectConfigs) {
  return configs
    .find((dc) => dc.resolvedConnectors.find((connector) => isPathInside(filePath, connector.path)));
}

export const serviceIds = computed(() => {
  const configs = dataConnectConfigs.valueOf();
  return configs.map((config) => config.serviceId);
});

export const getConnectorYamls = (serviceId: string) => {
  return computed(() => {
    const configs = dataConnectConfigs.valueOf();
    return configs.find((config) =>
      config.serviceId === serviceId
    ).resolvedConnectors;
  })
};
export const getConnectorIds = (serviceId: string) => computed(() => {
  const yamls = getConnectorYamls(serviceId).valueOf();
  return yamls.map((yaml) => yaml.connectorId);
})