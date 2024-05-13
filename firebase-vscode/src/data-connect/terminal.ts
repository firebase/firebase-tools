import { TerminalOptions } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import vscode, { Disposable } from "vscode";
import { checkLogin } from "../core/user";
const environmentVariables = {};

const terminalOptions: TerminalOptions = {
  name: "Data Connect Terminal",
  env: environmentVariables,
};

export function setTerminalEnvVars(envVar: string, value: string) {
  environmentVariables[envVar] = value;
}

export function runCommand(command: string) {
  const terminal = vscode.window.createTerminal(terminalOptions);
  terminal.show();
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
            new Error(`Failed to execute ${taskName} with command: ${command}`),
          );
        }
      }
    });
    vscode.tasks.executeTask(
      new vscode.Task(
        { type },
        vscode.TaskScope.Workspace,
        taskName,
        "firebase",
        new vscode.ShellExecution(command),
      ),
    );
  });
}

export function registerTerminalTasks(broker: ExtensionBrokerImpl): Disposable {
  const loginTaskBroker = broker.on("executeLogin", () => {
    runTerminalTask("firebase login", "firebase login --no-localhost").then(() => {
      checkLogin();
    });
  });

  return Disposable.from(
    { dispose: loginTaskBroker },
    vscode.commands.registerCommand(
      "firebase.dataConnect.runTerminalTask",
      (taskName, command) => {
        runTerminalTask(taskName, command);
      },
    ),
  );
}
