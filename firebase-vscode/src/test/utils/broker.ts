import { BrokerImpl, Receiver } from "../../messaging/broker";
import {
  MessageParamsMap,
  WebviewToExtensionParamsMap,
} from "../../../common/messaging/protocol";
import { createFake } from "./mock";

export type SentLog = { message: string; args: any[] };

type OnListener = (...args: unknown[]) => void;

export interface TestBroker
  extends BrokerImpl<MessageParamsMap, WebviewToExtensionParamsMap, Receiver> {
  sentLogs: Array<SentLog>;
  onListeners: Record<string, Array<OnListener>>;

  simulateOn(message: string, ...args: unknown[]): void;
}

/** Creates a fake broker for testing purposes.
 *
 * It enables observing the messages sent to the broker, and simulating messages
 * received.
 */
export function createTestBroker(): TestBroker {
  const sentLogs: Array<SentLog> = [];

  const listeners: Record<string, Array<OnListener>> = {};

  const fake = createFake<TestBroker>({
    onListeners: listeners,
    on(message, listener) {
      const listenersForMessage = (listeners[message] ??= []);
      listenersForMessage.push(listener as any);

      return () => {
        const index = listenersForMessage.indexOf(listener as any);
        if (index !== -1) {
          listenersForMessage.splice(index, 1);
        }

        if (listenersForMessage.length === 0) {
          delete listeners[message];
        }
      };
    },
    send(message, ...args) {
      sentLogs.push({ message, args });
    },
    sentLogs: sentLogs,
    simulateOn(message, ...args) {
      const listenersForMessage = listeners[message] ?? [];
      for (const listener of listenersForMessage) {
        listener(...args);
      }
    },
  });

  return fake;
}
