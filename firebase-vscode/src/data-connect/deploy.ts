import * as vscode from "vscode";
import { firstWhere, firstWhereDefined } from "../utils/signal";
import { currentOptions } from "../options";
import { deploy as cliDeploy } from "../../../src/deploy";
import { dataConnectConfigs } from "./config";
import { createE2eMockable } from "../utils/test_hooks";
import { runCommand } from "./terminal";
import { ExtensionBrokerImpl } from "../extension-broker";

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

export function registerFdcDeploy(
  broker: ExtensionBrokerImpl,
): vscode.Disposable {
  const deploySpy = createE2eMockable(
    async (...args: Parameters<typeof cliDeploy>) => {
      // Have the "deploy" return "void" for easier mocking (no return value when spied).
      cliDeploy(...args);
    },
    "deploy",
    async () => {},
  );

  const deployAllCmd = vscode.commands.registerCommand("fdc.deploy-all", () => {
    runCommand("firebase deploy --only dataconnect");
  });

  const deployCmd = vscode.commands.registerCommand("fdc.deploy", async () => {
    const configs = await firstWhereDefined(dataConnectConfigs).then(
      (c) => c.requireValue,
    );

    const pickedServices = await pickServices(configs.serviceIds);
    if (!pickedServices.length) {
      return;
    }

    const serviceConnectorMap: { [key: string]: string[] } = {};
    for (const serviceId of pickedServices) {
      const connectorIds = configs.findById(serviceId)?.connectorIds;
      serviceConnectorMap[serviceId] = await pickConnectors(
        connectorIds,
        serviceId,
      );
    }

    runCommand(createDeployOnlyCommand(serviceConnectorMap)); // run from terminal
  });

  const deployAllSub = broker.on("fdc.deploy-all", async () =>
    vscode.commands.executeCommand("fdc.deploy-all"),
  );

  const deploySub = broker.on("fdc.deploy", async () =>
    vscode.commands.executeCommand("fdc.deploy"),
  );

  return vscode.Disposable.from(
    deploySpy,
    deployAllCmd,
    deployCmd,
    { dispose: deployAllSub },
    { dispose: deploySub },
  );
}

async function pickServices(
  serviceIds: string[],
): Promise<Array<string> | undefined> {
  const options = firstWhere(
    currentOptions,
    (options) => options.project?.length !== 0,
  ).then((options) => {
    return serviceIds.map((serviceId) => {
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
  connectorIds: string[] | undefined,
  serviceId: string,
): Promise<Array<string> | undefined> {
  const options = firstWhere(
    currentOptions,
    (options) => options.project?.length !== 0,
  ).then((options) => {
    return connectorIds?.map((connectorId) => {
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
