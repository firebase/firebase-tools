export interface Message {
  message: string;
  data: any[];
}

export type Listener = (...args: any[]) => void;

export interface MessageListeners {
  [message: string]: { listeners: Listener[] };
}
