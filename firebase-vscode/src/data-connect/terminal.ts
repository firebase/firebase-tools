import { TerminalOptions } from "vscode";
import * as vscode from "vscode";

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
