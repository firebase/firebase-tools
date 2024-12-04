import { ExtensionBrokerImpl } from "../extension-broker";
import vscode, { Disposable, TelemetryLogger, TerminalOptions } from "vscode";
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
  presentationOptions: vscode.TaskPresentationOptions = { focus: true },
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
    const task = new vscode.Task(
      { type },
      vscode.TaskScope.Workspace,
      taskName,
      "firebase",
      new vscode.ShellExecution(command, executionOptions),
    );
    task.presentationOptions = presentationOptions;
    await vscode.tasks.executeTask(task);
  });
}

export function registerTerminalTasks(
  broker: ExtensionBrokerImpl,
  telemetryLogger: TelemetryLogger,
): Disposable {
  const settings = getSettings();

  const loginTaskBroker = broker.on("executeLogin", () => {
    telemetryLogger.logUsage(DATA_CONNECT_EVENT_NAME.IDX_LOGIN, {
      firebase_binary_kind: settings.firebaseBinaryKind,
    });
    runTerminalTask(
      "firebase login",
      `${settings.firebasePath} login --no-localhost`,
    ).then(() => {
      checkLogin();
    });
  });

  const startEmulatorsTask = () => {
    telemetryLogger.logUsage(DATA_CONNECT_EVENT_NAME.START_EMULATORS, {
      firebase_binary_kind: settings.firebaseBinaryKind,
    });
    // TODO: optional debug mode
    runTerminalTask(
      "firebase emulators",
      `${settings.firebasePath} emulators:start --project ${currentProjectId.value}`,
      // emulators:start almost never ask interactive questions.
      { focus: false },
    );
  };
  const startEmulatorsTaskBroker = broker.on("runStartEmulators", () => {
    startEmulatorsTask();
  });
  const startEmulatorsCommand = vscode.commands.registerCommand(
    "firebase.emulators.start",
    startEmulatorsTask,
  );

  return Disposable.from(
    { dispose: loginTaskBroker },
    { dispose: startEmulatorsTaskBroker },
    startEmulatorsCommand,
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
