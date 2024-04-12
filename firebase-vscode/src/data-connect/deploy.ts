import * as vscode from "vscode";
import { firstWhere } from "../utils/signal";
import { currentOptions } from "../options";
import { deploy as cliDeploy } from "../../../src/deploy";
import { dataConnectConfigs } from "./config";
import { createE2eMockable } from "../utils/test_hooks";
import { runCommand } from "./terminal";

function createDeployOnlyCommand(serviceConnectorMap: {
  [key: string]: string[];
}): string {
  // TODO: if all services/connectors are selected, just run "firebase deploy --only dataconnect"
  return (
    "firebase deploy --only " +
    Object.entries(serviceConnectorMap)
      .map(([serviceId, connectorIds]) => {
        return `dataconnect:${serviceId}:schema:${connectorIds.join(":")}`;
      })
      .join(",")
  );
}

export function registerFdcDeploy(): vscode.Disposable {
  const deploySpy = createE2eMockable(
    async (...args: Parameters<typeof cliDeploy>) => {
      // Have the "deploy" return "void" for easier mocking (no return value when spied).
      cliDeploy(...args);
    },
    "deploy",
    async () => {},
  );

  const deployCmd = vscode.commands.registerCommand(
    "fdc-graphql.deploy",
    async () => {
      const pickedServices = await pickServices();
      if (!pickedServices) {
        return;
      }

      const serviceConnectorMap: { [key: string]: string[] } = {};
      for (const service of pickedServices) {
        serviceConnectorMap[service] = await pickConnectors(service);
      }

      runCommand(createDeployOnlyCommand(serviceConnectorMap)); // run from terminal
    },
  );

  return vscode.Disposable.from(deploySpy, deployCmd);
}



async function pickServices(): Promise<Array<string> | undefined> {
  const options = firstWhere(
    currentOptions,
    (options) => options.project?.length !== 0,
  ).then((options) => {
    return dataConnectConfigs.value.serviceIds.map((serviceId) => {
      return {
        label: serviceId,
        options,
        picked: true,
      };
    });
  });

  const picked = await vscode.window.showQuickPick(options, {
    title: "Select services to deploy",
    canPickMany: true,
  });

  return picked.filter((e) => e.picked).map((service) => service.label);
}

async function pickConnectors(
  serviceId: string,
): Promise<Array<string> | undefined> {
  const options = firstWhere(
    currentOptions,
    (options) => options.project?.length !== 0,
  ).then((options) => {
    return dataConnectConfigs.value
      .findById(serviceId)
      ?.connectorIds.map((connectorId) => {
        return {
          label: connectorId,
          options,
          picked: true,
        };
      });
  });

  const picked = await vscode.window.showQuickPick(options, {
    title: `Select connectors to deploy for: ${serviceId}`,
    canPickMany: true,
  });

  return picked.filter((e) => e.picked).map((connector) => connector.label);
}
