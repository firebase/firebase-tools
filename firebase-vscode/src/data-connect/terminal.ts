import { TelemetryLogger, TerminalOptions } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import vscode, { Disposable } from "vscode";
import { checkLogin } from "../core/user";
import { DATA_CONNECT_EVENT_NAME } from "../analytics";
import { getSettings } from "../utils/settings";
import { currentProjectId } from "../core/project";

const environmentVariables: Record<string, string> = {};

const executionOptions: vscode.ShellExecutionOptions = {
  env: environmentVariables,
};

export function setTerminalEnvVars(envVar: string, value: string) {
  environmentVariables[envVar] = value;
}

export function runCommand(command: string) {
  const terminalOptions: TerminalOptions = {
    name: "Data Connect Terminal",
    env: environmentVariables,
  };
  const terminal = vscode.window.createTerminal(terminalOptions);
  terminal.show();

  // TODO: This fails if the interactive shell is not expecting a command, such
  // as when oh-my-zsh asking for (Y/n) to updates during startup.
  // Consider using an non-interactive shell.
  if (currentProjectId.value) {
    command = `${command} --project ${currentProjectId.value}`;
  }
  terminal.sendText(command);
}

export function runTerminalTask(
  taskName: string,
  command: string,
): Promise<string> {
  const type = "firebase-" + Date.now();
  return new Promise(async (resolve, reject) => {
    vscode.tasks.onDidEndTaskProcess(async (e) => {
      if (e.execution.task.definition.type === type) {
        e.execution.terminate();

        if (e.exitCode === 0) {
          resolve(`Successfully executed ${taskName} with command: ${command}`);
        } else {
          reject(
            new Error(
              `{${e.exitCode}}: Failed to execute ${taskName} with command: ${command}`,
            ),
          );
        }
      }
    });
    const task = await vscode.tasks.executeTask(
      new vscode.Task(
        { type },
        vscode.TaskScope.Workspace,
        taskName,
        "firebase",
        new vscode.ShellExecution(command, executionOptions),
      ),
    );
  });
}

export function registerTerminalTasks(
  broker: ExtensionBrokerImpl,
  telemetryLogger: TelemetryLogger,
): Disposable {
  const settings = getSettings();

  const loginTaskBroker = broker.on("executeLogin", () => {
    telemetryLogger.logUsage(DATA_CONNECT_EVENT_NAME.IDX_LOGIN);
    runTerminalTask(
      "firebase login",
      `${settings.firebasePath} login --no-localhost`,
    ).then(() => {
      checkLogin();
    });
  });

  const startEmulatorsTaskBroker = broker.on("runStartEmulators", () => {
    telemetryLogger.logUsage(DATA_CONNECT_EVENT_NAME.START_EMULATORS);
    // TODO: optional debug mode
    runTerminalTask(
      "firebase emulators",
      `${settings.firebasePath} emulators:start --project ${currentProjectId.value}`,
    );
  });

  return Disposable.from(
    { dispose: loginTaskBroker },
    vscode.commands.registerCommand(
      "firebase.dataConnect.runTerminalTask",
      (taskName, command) => {
        telemetryLogger.logUsage(DATA_CONNECT_EVENT_NAME.COMMAND_EXECUTION, {
          commandName: command,
        });
        runTerminalTask(taskName, command);
      },
    ),
  );
}
