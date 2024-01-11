import { useEffect, useState } from "react";
import { Broker, createBroker } from "../../common/messaging/broker";
import {
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
} from "../../common/messaging/protocol";
import { webLogger } from "./web-logger";

export function useBrokerListener<
  MessageT extends keyof ExtensionToWebviewParamsMap,
>(
  message: Extract<MessageT, string>,
  callback: (value: ExtensionToWebviewParamsMap[MessageT]) => void,
) {
  useEffect(() => {
    broker.on(message, callback);
    // TODO return a cleanup function to remove the listener
  }, [message]);
}

/** Listen to messages, returning the latest sent event */
export function useBroker<MessageT extends keyof ExtensionToWebviewParamsMap>(
  message: Extract<MessageT, string>,
  options?: {
    initialRequest: keyof WebviewToExtensionParamsMap;
  },
): ExtensionToWebviewParamsMap[MessageT] | undefined {
  const [value, setValue] = useState<
    ExtensionToWebviewParamsMap[MessageT] | undefined
  >();

  useEffect(() => {
    webLogger.info("here", "mount", message);
    const unSub = broker.on(message, (value) => {
      webLogger.info("here", "received", message, `${value}`);
      setValue(value);
    });

    // TODO return a cleanup function to remove the listener
    return () => {
      webLogger.info("here", "unmount");
      unSub();
    };
  }, [message]);

  useEffect(() => {
    if (options?.initialRequest) {
      webLogger.info("here", "send", options.initialRequest);
      broker.send(options.initialRequest);
    }
  }, [options?.initialRequest]);

  webLogger.info("here", "did useBroker");

  return value;
}

export class HtmlBroker extends Broker<
  WebviewToExtensionParamsMap,
  ExtensionToWebviewParamsMap,
  {}
> {
  constructor(readonly vscode: any) {
    super();
    window.addEventListener("message", (event) =>
      this.executeListeners(event.data),
    );

    // Log uncaught errors and unhandled rejections
    window.addEventListener("error", (event) => {
      webLogger.error(
        event.error.message,
        event.error.stack && "\n",
        event.error.stack,
      );
    });
    window.addEventListener("unhandledrejection", (event) => {
      webLogger.error(
        "Unhandled rejected promise:",
        event.reason,
        event.reason.stack && "\n",
        event.reason.stack,
      );
    });
  }

  sendMessage(
    command: keyof WebviewToExtensionParamsMap,
    data: WebviewToExtensionParamsMap[keyof WebviewToExtensionParamsMap],
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
