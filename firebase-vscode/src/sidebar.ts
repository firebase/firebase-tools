import {
  CancellationToken,
  commands,
  ExtensionContext,
  Uri,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
  window,
} from "vscode";
import { getHtmlForWebview } from "./html-scaffold";
import { ExtensionBrokerImpl } from "./extension-broker";

export function setupSidebar(
  context: ExtensionContext,
  extensionBroker: ExtensionBrokerImpl
): MonospaceSidebarViewProvider {
  const provider = new MonospaceSidebarViewProvider(
    context.extensionUri,
    extensionBroker
  );
  context.subscriptions.push(
    window.registerWebviewViewProvider(
      MonospaceSidebarViewProvider.viewType,
      provider
    )
  );
  return provider;
}

class MonospaceSidebarViewProvider implements WebviewViewProvider {
  public static readonly viewType = "firebase.sidebarView";
  private _view?: WebviewView;

  constructor(
    private readonly _extensionUri: Uri,
    private readonly extensionBroker: ExtensionBrokerImpl
  ) {}

  public resolveWebviewView(
    webviewView: WebviewView,
    context: WebviewViewResolveContext,
    _token: CancellationToken
  ) {
    this._view = webviewView;
    this.extensionBroker.registerReceiver(webviewView.webview);
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    webviewView.webview.html = getHtmlForWebview(
      "sidebar",
      this._extensionUri,
      webviewView.webview
    );
    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case "executeCommand": {
          commands.executeCommand(data.command, ...(data.args || []));
          break;
        }
      }
    });
  }
}
