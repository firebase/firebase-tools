// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { getGlobalDefaultAccount, loginAdditionalAccount} from '../../src/auth';
import { ExtensionBroker } from './extension-broker';
import { createBroker } from '../common/messaging/broker';
import { ExtensionToWebview, WebviewToExtension } from '../common/messaging/protocol';
import { setupSidebar } from './sidebar';
import { setupWorkflow } from './workflow';

const broker = createBroker<ExtensionToWebview, WebviewToExtension, vscode.Webview>(
  new ExtensionBroker()
);

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "firebase-vscode" is now active!');

	setupWorkflow(context, broker);
	setupSidebar(context, broker);
}

// This method is called when your extension is deactivated
export function deactivate() { }
