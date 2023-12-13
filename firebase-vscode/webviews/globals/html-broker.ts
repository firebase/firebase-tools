import { Broker, createBroker } from "../../common/messaging/broker";
import {
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
} from "../../common/messaging/protocol";
import { webLogger } from "./web-logger";

export class HtmlBroker extends Broker<
  WebviewToExtensionParamsMap,
  ExtensionToWebviewParamsMap,
  {}
> {
  constructor(readonly vscode: any) {
    super();
    window.addEventListener("message", (event) =>
      this.executeListeners(event.data)
    );

    // Log uncaught errors and unhandled rejections
    window.addEventListener("error", (event) => {
      webLogger.error(
        event.error.message,
        event.error.stack && "\n",
        event.error.stack
      );
    });
    window.addEventListener("unhandledrejection", (event) => {
      webLogger.error(
        "Unhandled rejected promise:",
        event.reason,
        event.reason.stack && "\n",
        event.reason.stack
      );
    });
  }

  sendMessage(
    command: keyof WebviewToExtensionParamsMap,
    data: WebviewToExtensionParamsMap[keyof WebviewToExtensionParamsMap]
  ): void {
    this.vscode.postMessage({ command, data });
  }
}

const vscode = (window as any)["acquireVsCodeApi"]();
export const broker = createBroker<
  WebviewToExtensionParamsMap,
  ExtensionToWebviewParamsMap,
  {}
>(new HtmlBroker(vscode));
