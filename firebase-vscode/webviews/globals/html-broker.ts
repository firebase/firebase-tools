import { Broker, createBroker } from "../../common/messaging/broker";
import {
  ExtensionToWebview,
  WebviewToExtension,
} from "../../common/messaging/protocol";

export class HtmlBroker extends Broker {
  constructor(readonly vscode: any) {
    super();
    window.addEventListener("message", (event) => {
      this.executeListeners(event.data);
    });
  }

  sendMessage(message: string, data: any[]): void {
    this.vscode.postMessage({ message, data });
  }
}

const vscode = (window as any)["acquireVsCodeApi"]();
export const broker = createBroker<WebviewToExtension, ExtensionToWebview, {}>(
  new HtmlBroker(vscode)
);
