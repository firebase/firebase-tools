import { TelemetryLogger, TerminalOptions } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import vscode, { Disposable } from "vscode";
import { checkLogin } from "../core/user";
import { DATA_CONNECT_EVENT_NAME, AnalyticsLogger } from "../analytics";
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
  const settings = getSettings();
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
  if (settings.debug) {
    command = `${command} --debug`;
  }
  terminal.sendText(command);
}

export function runTerminalTask(
  taskName: string,
  command: string,
  presentationOptions: vscode.TaskPresentationOptions = { focus: true },
): Promise<string> {
  const settings = getSettings();
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
    const task = new vscode.Task(
      { type },
      vscode.TaskScope.Workspace,
      taskName,
      "firebase",
      new vscode.ShellExecution(`${command}${settings.debug ? " --debug" : ""}`, executionOptions),
    );
    task.presentationOptions = presentationOptions;
    await vscode.tasks.executeTask(task);
  });
}

export function registerTerminalTasks(
  broker: ExtensionBrokerImpl,
  analyticsLogger: AnalyticsLogger,
): Disposable {
  const settings = getSettings();

  const loginTaskBroker = broker.on("executeLogin", () => {
    analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.IDX_LOGIN);
    runTerminalTask(
      "firebase login",
      `${settings.firebasePath} login --no-localhost`,
    ).then(() => {
      checkLogin();
    });
  });

  const startEmulatorsTaskBroker = broker.on("runStartEmulators", () => {
    analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.START_EMULATORS);
    // TODO: optional debug mode
    runTerminalTask(
      "firebase emulators",
      `${settings.firebasePath} emulators:start --project ${currentProjectId.value}`,
      // emulators:start almost never ask interactive questions.
      { focus: false },
    );
  });

  return Disposable.from(
    { dispose: loginTaskBroker },
    { dispose: startEmulatorsTaskBroker },
    vscode.commands.registerCommand(
      "firebase.dataConnect.runTerminalTask",
      (taskName, command) => {
        analyticsLogger.logger.logUsage(
          DATA_CONNECT_EVENT_NAME.COMMAND_EXECUTION,
          {
            commandName: command,
          },
        );
        runTerminalTask(taskName, command);
      },
    ),
  );
}
