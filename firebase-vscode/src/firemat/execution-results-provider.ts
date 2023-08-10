import * as vscode from "vscode"; // from //third_party/vscode/src/vs:vscode
import { ExtensionBrokerImpl } from "../extension-broker";
import { getHtmlForWebview } from "../html-scaffold";

/** Provides the webview for the gql result table view. */
export class ExecutionResultsViewProvider
  implements vscode.WebviewViewProvider
{
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly extensionBroker: ExtensionBrokerImpl
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    this.extensionBroker.registerReceiver(webviewView.webview);

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = getHtmlForWebview(
      "firemat_execution_results",
      this.extensionUri,
      webviewView.webview
    );

    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case "executeCommand": {
          vscode.commands.executeCommand(data.command, ...(data.args || []));
          break;
        }
      }
    });
  }
}
