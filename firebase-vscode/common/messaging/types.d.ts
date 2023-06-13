import { Channel } from "../hosting/api";
import { ExtensionToWebviewParamsMap, MessageParamsMap } from "./protocol";

export interface Message<M> {
  command: string;
  data: M[keyof M];
}

export type Listener<M> = (args?: M[keyof M]) => void;

export interface MessageListeners<M> {
  [message: string]: { listeners: Listener<M>[] };
}

export interface ChannelWithId extends Channel {
  id: string;
}
