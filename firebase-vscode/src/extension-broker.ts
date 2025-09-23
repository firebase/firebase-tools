import { Webview } from "vscode";

import { Broker, BrokerImpl } from "../common/messaging/broker";
import {
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
} from "../common/messaging/protocol";
import { Message } from "../common/messaging/types";

export type ExtensionBrokerImpl = BrokerImpl<
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
  Webview
>;

export class ExtensionBroker extends Broker<
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
  Webview
> {
  private webviews: Webview[] = [];

  sendMessage(
    command: string,
    data: ExtensionToWebviewParamsMap[keyof ExtensionToWebviewParamsMap]
  ): void {
    for (const webview of this.webviews) {
      webview.postMessage({ command, data });
    }
  }

  registerReceiver(receiver: Webview) {
    const webview = receiver;
    this.webviews.push(webview);
    webview.onDidReceiveMessage(
      (message: Message<WebviewToExtensionParamsMap>) => {
        this.executeListeners(message);
      },
      null
    );
  }

  delete(): void {
    this.webviews = [];
  }
}
