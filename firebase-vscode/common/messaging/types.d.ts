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
  mode: "all" | "dataconnect";
  debugLogging: boolean;
}
