import * as vscode from "vscode";
import { firstWhere } from "../utils/signal";
import { currentOptions } from "../options";
import { deploy as cliDeploy } from "../../../src/deploy";
import { dataConnectConfigs } from "./config";
import { createE2eMockable } from "../utils/test_hooks";

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

      const serviceConnectorMap = {};
      for (const service of pickedServices) {
        serviceConnectorMap[service] = await pickConnectors(service);
      }

      // TODO: create --only strings like service:connector:connector when CLI flag is available
      for (const service of pickedServices) {
        deploySpy.call(["dataconnect"], currentOptions.valueOf(), {
          context: service,
        });
      }
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
