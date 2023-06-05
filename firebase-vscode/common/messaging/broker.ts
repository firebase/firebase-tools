import { Listener, Message, MessageListeners } from "./types";
import { Webview } from "vscode";

const isObject = (val: any): boolean => typeof val === "object" && val !== null;

type Receiver = {} | Webview;

export abstract class Broker {
  protected readonly listeners: MessageListeners = {};

  abstract sendMessage(message: string, data: any[]): void;
  registerReceiver(receiver: any): void { }

  addListener(message: string, cb: Listener): void {
    if (!this.listeners[message]) {
      this.listeners[message] = { listeners: [] };
    }
    this.listeners[message].listeners.push(cb);
  }

  executeListeners(data: Message) {
    if (data === undefined || !isObject(data) || !data.message) {
      return;
    }

    const d = data;

    if (this.listeners[d.message] === undefined) {
      return;
    }

    for (const listener of this.listeners[d.message].listeners) {
      d.data === undefined ? listener() : listener(...d.data);
    };
  }

  delete(): void { }
}

type ListenersMap<U> = {
  [K in keyof U]: Listener;
};

export interface BrokerImpl<
  OutgoingMessages extends ListenersMap<OutgoingMessages>,
  IncomingMessages extends ListenersMap<IncomingMessages>,
  R extends Receiver
> {
  send<E extends keyof OutgoingMessages>(
    message: Extract<E, string>,
    ...args: Parameters<OutgoingMessages[E]>
  ): void;
  registerReceiver(receiver: R): void;
  on<E extends keyof IncomingMessages>(
    message: Extract<E, string>,
    listener: IncomingMessages[E]
  ): void;
  delete(): void;
}

export function createBroker<
  OutgoingMessages extends ListenersMap<OutgoingMessages>,
  IncomingMessages extends ListenersMap<IncomingMessages>,
  R extends Receiver
>(broker: Broker): BrokerImpl<OutgoingMessages, IncomingMessages, Receiver> {
  return {
    send<E extends keyof OutgoingMessages>(
      message: Extract<E, string>,
      ...args: Parameters<OutgoingMessages[E]>
    ): void {
      broker.sendMessage(message, args);
    },
    registerReceiver(receiver: R): void {
      broker.registerReceiver(receiver);
    },
    on<E extends keyof IncomingMessages>(
      message: Extract<E, string>,
      listener: IncomingMessages[E]
    ): void {
      broker.addListener(message, listener);
    },
    delete(): void {
      broker.delete();
    }
  };
}
