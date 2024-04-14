import { useEffect, useState } from "react";
import { Broker, createBroker } from "../../common/messaging/broker";
import {
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
} from "../../common/messaging/protocol";

export function useBrokerListener<
  MessageT extends keyof ExtensionToWebviewParamsMap
>(
  message: Extract<MessageT, string>,
  callback: (value: ExtensionToWebviewParamsMap[MessageT]) => void
) {
  useEffect(() => {
    return broker.on(message, callback);
  }, [message]);
}

/** Listen to messages, returning the latest sent event */
export function useBroker<MessageT extends keyof ExtensionToWebviewParamsMap>(
  message: Extract<MessageT, string>,
  options?: {
    initialRequest: keyof WebviewToExtensionParamsMap;
  }
): ExtensionToWebviewParamsMap[MessageT] | undefined {
  const [value, setValue] = useState<
    ExtensionToWebviewParamsMap[MessageT] | undefined
  >();

  useEffect(() => {
    const unSub = broker.on(message, (value) => {
      setValue(value);
    });

    return unSub;
  }, [message]);

  useEffect(() => {
    if (options?.initialRequest) {
      broker.send(options.initialRequest);
    }
  }, [options?.initialRequest]);

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
      this.executeListeners(event.data)
    );
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
