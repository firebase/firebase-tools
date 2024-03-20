import * as vscode from "vscode";
import { firstWhere } from "../utils/signal";
import { currentOptions } from "../options";
import { deploy as cliDeploy } from "../../../src/deploy";
import { getConnectorIds, serviceIds } from "./config";
export function registerFdcDeploy(): vscode.Disposable {
  // A command used by e2e tests to replace the `deploy` function with a mock.
  // It is not part of the public API.
  const mockDeployCmd = vscode.commands.registerCommand(
    "fdc-graphql.spy-deploy",
    (options: { reset?: boolean }) => {
      const reset = options?.reset ?? false;
      if (reset) {
        deploySpy = undefined;
        deploy.value = cliDeploy;
      } else if (!deploySpy) {
        deploySpy = [];
        deploy.value = async (...args) => deploySpy.push(args) as any;
      }

      return deploySpy;
    },
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
        deploy.value(["dataconnect"], currentOptions.valueOf(), {
          context: service,
        });
      }
    },
  );

  return vscode.Disposable.from(mockDeployCmd, deployCmd);
}

async function pickServices(): Promise<Array<string> | undefined> {
  const options = firstWhere(
    currentOptions,
    (options) => options.project?.length !== 0,
  ).then((options) => {
    return serviceIds.valueOf().map((serviceId) => {
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
    return getConnectorIds(serviceId)
      .valueOf()
      .map((connectorId) => {
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

let deploySpy: Array<any> | undefined;

/// An overridable wrapper of `deploy` for testing purposes.
const deploy = { value: cliDeploy };
