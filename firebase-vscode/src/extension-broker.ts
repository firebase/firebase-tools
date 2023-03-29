import { Webview } from "vscode";

import {
  Broker,
  BrokerImpl,
} from "../common/messaging/broker";
import {
  ExtensionToWebview,
  WebviewToExtension,
} from "../common/messaging/protocol";

export type ExtensionBrokerImpl = BrokerImpl<
  ExtensionToWebview,
  WebviewToExtension,
  Webview
>;

export class ExtensionBroker extends Broker {
  private webviews: Webview[] = [];

  sendMessage(message: string, data: any[]): void {
    this.webviews.forEach((webview) => {
      webview.postMessage({ message, data });
    });
  }

  registerReceiver(receiver: any) {
    const webview = receiver as Webview;
    this.webviews.push(webview);
    webview.onDidReceiveMessage((data: any) => {
      this.executeListeners(data);
    }, null);
  }

  delete(): void {
    this.webviews = [];
  }
}
