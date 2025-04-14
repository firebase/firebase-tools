import { MessageParamsMap } from "./protocol";
import { Listener, Message, MessageListeners } from "./types";
import { Webview } from "vscode";

const isObject = (val: any): boolean => typeof val === "object" && val !== null;

export type Receiver = {} | Webview;

export abstract class Broker<
  OutgoingMessages extends MessageParamsMap,
  IncomingMessages extends MessageParamsMap,
  R extends Receiver,
> {
  protected readonly listeners: MessageListeners<IncomingMessages> = {};

  abstract sendMessage<T extends keyof OutgoingMessages>(
    message: T,
    data: OutgoingMessages[T],
  ): void;
  registerReceiver(receiver: R): void {}

  addListener(message: string, cb: Listener<IncomingMessages>): () => void {
    const messageListeners = (this.listeners[message] ??= []);

    messageListeners.push(cb);

    return () => {
      const index = messageListeners.indexOf(cb);
      if (index !== -1) {
        messageListeners.splice(index, 1);
      }

      if (messageListeners.length === 0) {
        delete this.listeners[message];
      }
    };
  }

  executeListeners(message: Message<IncomingMessages>) {
    if (message === undefined || !isObject(message) || !message.command) {
      return;
    }

    const d = message;

    if (this.listeners[d.command] === undefined) {
      return;
    }

    for (const listener of this.listeners[d.command]) {
      d.data === undefined ? listener() : listener(d.data);
    }
  }

  delete(): void {}
}

export interface BrokerImpl<
  OutgoingMessages,
  IncomingMessages,
  R extends Receiver,
> {
  send<E extends keyof OutgoingMessages>(
    message: E,
    args?: OutgoingMessages[E],
  ): void;
  registerReceiver(receiver: R): void;
  on<E extends keyof IncomingMessages>(
    message: Extract<E, string>,
    listener: (params: IncomingMessages[E]) => void,
  ): () => void;
  delete(): void;
}

export function createBroker<
  OutgoingMessages extends MessageParamsMap,
  IncomingMessages extends MessageParamsMap,
  R extends Receiver,
>(
  broker: Broker<OutgoingMessages, IncomingMessages, R>,
): BrokerImpl<OutgoingMessages, IncomingMessages, Receiver> {
  return {
    send<E extends keyof OutgoingMessages>(
      message: Extract<E, string>,
      args: OutgoingMessages[E],
    ): void {
      broker.sendMessage<E>(message, args);
    },
    registerReceiver(receiver: R): void {
      broker.registerReceiver(receiver);
    },
    on<E extends keyof IncomingMessages>(
      message: Extract<E, string>,
      listener: (params: IncomingMessages[E]) => void,
    ): () => void {
      return broker.addListener(
        message,
        listener as Listener<IncomingMessages>,
      );
    },
    delete(): void {
      broker.delete();
    },
  };
}
