import { Channel } from "../hosting/api";
import { EmulatorInfo } from "../emulator/types";
import { ExtensionToWebviewParamsMap, MessageParamsMap } from "./protocol";

export interface Message<M> {
  command: string;
  data: M[keyof M];
}

export type Listener<M> = (args?: M[keyof M]) => void;

export interface MessageListeners<M> {
  [message: string]: Listener<M>[];
}

export interface ChannelWithId extends Channel {
  id: string;
}

/**
 * Info to display in the UI while the emulators are running
 */
export interface RunningEmulatorInfo {
  displayInfo: EmulatorInfo[];
}

export interface EmulatorUiSelections {
  projectId: string;
  firebaseJsonPath?: string;
  importStateFolderPath?: string;
  exportStateOnExit: boolean;
  mode: "hosting" | "all" | "dataconnect";
  debugLogging: boolean;
}
