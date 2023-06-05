import { Webview } from "vscode";

import { Broker, BrokerImpl } from "../common/messaging/broker";
import {
  ExtensionToWebview,
  WebviewToExtension,
} from "../common/messaging/protocol";
import { Message } from "../common/messaging/types";

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

  registerReceiver(receiver: Webview) {
    const webview = receiver;
    this.webviews.push(webview);
    webview.onDidReceiveMessage((message: Message) => {
      this.executeListeners(message);
    }, null);
  }

  delete(): void {
    this.webviews = [];
  }
}
