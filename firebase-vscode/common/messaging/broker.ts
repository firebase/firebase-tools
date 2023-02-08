import { Listener, Message, MessageListeners } from "./types";

export const isUndefined = (val: any | undefined): val is undefined =>
  val === undefined;

const isObject = (val: any): boolean => typeof val === "object" && val !== null;

export abstract class Broker {
  protected readonly listeners: MessageListeners = {};

  abstract sendMessage(message: string, data: any[]): void;
  registerReceiver(receiver: any): void {}

  addListener(message: string, cb: Listener): void {
    if (!this.listeners[message]) {
      this.listeners[message] = { listeners: [] };
    }
    this.listeners[message].listeners.push(cb);
  }

  executeListeners(data: any | Message) {
    if (isUndefined(data) || !isObject(data) || !data.message) {
      return;
    }

    const d = data as Message;

    if (isUndefined(this.listeners[d.message])) {
      return;
    }

    this.listeners[d.message].listeners.forEach((cb) =>
      isUndefined(d.data) ? cb() : cb(...d.data)
    );
  }
}

type ListenersMap<U> = {
  [K in keyof U]: Listener;
};

export interface BrokerImpl<
  OutgoingMessages extends ListenersMap<OutgoingMessages>,
  IncomingMessages extends ListenersMap<IncomingMessages>,
  Receiver
> {
  send<E extends keyof OutgoingMessages>(
    message: Extract<E, string>,
    ...args: Parameters<OutgoingMessages[E]>
  ): void;
  registerReceiver(receiver: Receiver): void;
  on<E extends keyof IncomingMessages>(
    message: Extract<E, string>,
    listener: IncomingMessages[E]
  ): void;
}

export function createBroker<
  OutgoingMessages extends ListenersMap<OutgoingMessages>,
  IncomingMessages extends ListenersMap<IncomingMessages>,
  Receiver
>(broker: Broker): BrokerImpl<OutgoingMessages, IncomingMessages, Receiver> {
  return {
    send<E extends keyof OutgoingMessages>(
      message: Extract<E, string>,
      ...args: Parameters<OutgoingMessages[E]>
    ): void {
      broker.sendMessage(message, args);
    },
    registerReceiver(receiver: Receiver): void {
      broker.registerReceiver(receiver);
    },
    on<E extends keyof IncomingMessages>(
      message: Extract<E, string>,
      listener: IncomingMessages[E]
    ): void {
      broker.addListener(message, listener);
    },
  };
}
