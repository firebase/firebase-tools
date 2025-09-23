import { EmulatorInfo } from "../emulator/types";

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
  uiUrl: string;
  displayInfo: EmulatorInfo[];
}

export type EmulatorsStatus = "running" | "stopped" | "starting" | "stopping";
