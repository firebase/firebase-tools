/**
 * @fileoverview Lists all possible messages that can be passed back and forth
 * between two environments (VScode and Webview)
 */

import { FirebaseConfig } from "../../../src/firebaseConfig";
import { User } from "../../../src/types/auth";
import { ServiceAccountUser } from "../types";
import { RCData } from "../../../src/rc";
import { EmulatorUiSelections, RunningEmulatorInfo } from "./types";
import { ExecutionResult } from "graphql";
import { SerializedError } from "../error";

export const DEFAULT_EMULATOR_UI_SELECTIONS: EmulatorUiSelections = {
  projectId: "demo-something",
  importStateFolderPath: "",
  exportStateOnExit: false,
  mode: "dataconnect",
  debugLogging: false,
};

export enum UserMockKind {
  ADMIN = "admin",
  UNAUTHENTICATED = "unauthenticated",
  AUTHENTICATED = "authenticated",
}
export type UserMock =
  | { kind: UserMockKind.ADMIN | UserMockKind.UNAUTHENTICATED }
  | {
      kind: UserMockKind.AUTHENTICATED;
      claims: string;
    };

export interface WebviewToExtensionParamsMap {
  /**
   * Ask extension for initial data
   */
  getInitialData: {};
  addUser: {};
  logout: { email: string };

  /* Emulator panel requests */
  getEmulatorUiSelections: void;
  getEmulatorInfos: void;
  updateEmulatorUiSelections: Partial<EmulatorUiSelections>;
  /* Equivalent to the `firebase emulators:start` command.*/
  launchEmulators: void;

  /** Notify extension that current user has been changed in UI. */
  requestChangeUser: { user: User | ServiceAccountUser };

  /** Trigger project selection */
  selectProject: {};
  /**
   * Runs `firebase init hosting` command.
   * TODO(hsubox76): Generalize to work for all `firebase init` products.
   */
  selectAndInitHostingFolder: {
    projectId: string;
    singleAppSupport: boolean;
  };

  /**
   * Runs `firebase deploy` for hosting.
   * TODO(hsubox76): Generalize to work for all `firebase deploy` targets.
   */
  hostingDeploy: {
    target: string;
  };

  /**
   * Prompt user for text input
   */
  promptUserForInput: { title: string; prompt: string };

  /** Calls the `firebase init` CLI */
  runFirebaseInit: void;

  /**
   * Show a UI message using the vscode interface
   */
  showMessage: { msg: string; options?: {} };

  /**
   * Write a log to the extension logger.
   */
  writeLog: { level: string; args: string[] };

  /**
   * Call extension runtime to open a link (a href does not work in Monospace)
   */
  openLink: {
    href: string;
  };

  /** Stops the emulators gracefully allowing for data export if required. */
  stopEmulators: void;

  selectEmulatorImportFolder: {};

  definedDataConnectArgs: string;

  /** Prompts the user to select a directory in which to place the quickstart */
  chooseQuickstartDir: {};

  notifyAuthUserMockChange: UserMock;

  /** Deploy connectors/services to production */
  "fdc.deploy": void;

  /** Deploy all connectors/services to production */
  "fdc.deploy-all": void;
}

export interface DataConnectResults {
  query: string;
  displayName: string;
  results?: ExecutionResult | SerializedError;
  args?: string;
}

export type ValueOrError<T> =
  | { value: T; error: undefined }
  | { error: string; value: undefined };

export interface ExtensionToWebviewParamsMap {
  /** Triggered when the emulator UI/state changes */
  notifyEmulatorUiSelectionsChanged: EmulatorUiSelections;
  notifyEmulatorStateChanged: {
    status: "running" | "stopped" | "starting" | "stopping";
    infos: RunningEmulatorInfo | undefined;
  };
  notifyEmulatorImportFolder: { folder: string };

  /** Triggered when new environment variables values are found. */
  notifyEnv: { env: { isMonospace: boolean } };

  /** Triggered when users have been updated. */
  notifyUsers: { users: User[] };

  /** Triggered when hosting channels have been fetched. */
  notifyChannels: { channels: any[] };

  /** Triggered when a new project is selected */
  notifyProjectChanged: { projectId: string };

  /**
   * This can potentially call multiple webviews to notify of user selection.
   */
  notifyUserChanged: { user: User | ServiceAccountUser };

  /**
   * Notifies webview when user has successfully selected a hosting folder
   * and it has been written to firebase.json.
   */
  notifyHostingInitDone: {
    success: boolean;
    projectId: string;
    folderPath?: string;
    framework?: string;
  };

  /**
   * Notify webview of status of deployment attempt.
   */
  notifyHostingDeploy: {
    success: boolean;
    consoleUrl?: string;
    hostingUrl?: string;
  };

  /**
   * Notify webview of initial discovery or change in firebase.json or
   * .firebaserc
   */
  notifyFirebaseConfig: {
    firebaseJson: ValueOrError<FirebaseConfig> | undefined;
    firebaseRC: ValueOrError<RCData> | undefined;
  };

  /**
   * Return user-selected preview channel name
   */
  notifyPreviewChannelResponse: { id: string };

  // data connect specific
  notifyDataConnectResults: DataConnectResults;
  notifyDataConnectRequiredArgs: { args: string[] };
}

export type MessageParamsMap =
  | WebviewToExtensionParamsMap
  | ExtensionToWebviewParamsMap;
