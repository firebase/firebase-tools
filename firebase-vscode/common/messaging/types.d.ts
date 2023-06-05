import { Channel } from "../hosting/api";

export interface Message {
  message: string;
  data: any[];
}

export type Listener = (...args: any[]) => void;

export interface MessageListeners {
  [message: string]: { listeners: Listener[] };
}

export interface ChannelWithId extends Channel {
  id: string;
}
