import * as vscode from "vscode";
import { firstWhere } from "../utils/signal";
import { VsCodeOptions, currentOptions } from "../options";
import { deploy as cliDeploy } from "../../../src/deploy";

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

      for (const service of pickedServices) {
        deploy.value(["dataconnect"], service);
      }
    },
  );

  return vscode.Disposable.from(mockDeployCmd, deployCmd);
}

async function pickServices(): Promise<Array<VsCodeOptions> | undefined> {
  const options = firstWhere(
    currentOptions,
    (options) => options.project?.length !== 0,
  ).then((options) => {
    return [
      {
        label: options.project,
        options,
        picked: true,
      },
      {
        label: "Fake service B",
        picked: false,
      },
    ];
  });

  const picked = await vscode.window.showQuickPick(options, {
    title: "Select services to deploy",
    canPickMany: true,
  });

  return picked.filter((e) => e.picked).map((service) => service.options);
}

let deploySpy: Array<any> | undefined;

/// An overridable wrapper of `deploy` for testing purposes.
const deploy = { value: cliDeploy };
