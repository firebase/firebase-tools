import { Broker, createBroker } from "../../common/messaging/broker";
import {
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
} from "../../common/messaging/protocol";

export class HtmlBroker extends Broker<
  WebviewToExtensionParamsMap, ExtensionToWebviewParamsMap, {}> {
  constructor(readonly vscode: any) {
    super();
    window.addEventListener("message", event => this.executeListeners(event.data));
  }

  sendMessage(message: keyof WebviewToExtensionParamsMap, data: WebviewToExtensionParamsMap[keyof WebviewToExtensionParamsMap]): void {
    this.vscode.postMessage({ message, data });
  }
}

const vscode = (window as any)["acquireVsCodeApi"]();
export const broker = createBroker<WebviewToExtensionParamsMap, ExtensionToWebviewParamsMap, {}>(
  new HtmlBroker(vscode)
);
