// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { getGlobalDefaultAccount, loginAdditionalAccount} from './auth';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "firebase-vscode" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('firebase-vscode.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const account = getGlobalDefaultAccount();

		console.log(`${JSON.stringify(account)}`);
		vscode.window.showInformationMessage(`User ${account?.user.email || 'none'}`);
	});

	context.subscriptions.push(disposable);

	context.subscriptions.push(
		vscode.commands.registerCommand('firebase-vscode.start', () => {
			// Can move this code outside this command if you want it to start at startup.
			// Create and show a new webview
			const panel = vscode.window.createWebviewPanel(
				'firebaseVscodePanel', // Identifies the type of the webview. Used internally
				'F I R E B A S E', // Title of the panel displayed to the user
				vscode.ViewColumn.Beside, // Editor column to show the new webview panel in.
				{} // Webview options. More on these later.
			);
			panel.webview.html = getWebviewContent();
		})
	);

	const thingProvider = new ThingProvider();

	context.subscriptions.push(
		vscode.commands.registerCommand('firebase-vscode.login', async () => {
			const { user } = await loginAdditionalAccount(true);
			thingProvider.addChild(new Thing(user.email, vscode.TreeItemCollapsibleState.None));
		})
	);
	vscode.window.createTreeView('thingsTree', { treeDataProvider: thingProvider });
	// vscode.window.createTreeView('thingView', { treeDataProvider: new ThingProvider() });
}

// This method is called when your extension is deactivated
export function deactivate() { }

function getWebviewContent() {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cat Coding</title>
</head>
<body>
    F I R E B A S E   E X T E N S I O N
</body>
</html>`;
}

class ThingProvider implements vscode.TreeDataProvider<Thing> {
	private things = [];
	private _onDidChangeTreeData: vscode.EventEmitter<Thing | undefined | null | void> = new vscode.EventEmitter<Thing | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<Thing | undefined | null | void> = this._onDidChangeTreeData.event;
	constructor() {
		const account = getGlobalDefaultAccount();
		if (account) {
			this.things.push(new Thing(account.user.email, vscode.TreeItemCollapsibleState.None));
		}
	}

	getTreeItem(element: Thing): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Thing): Thenable<Thing[]> {
		return Promise.resolve(this.things);
	}

	addChild(element: Thing) {
		this.things.push(element);
		this._onDidChangeTreeData.fire();
	}
}

class Thing extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(label, collapsibleState);
	}
}