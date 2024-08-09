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
  getInitialHasFdcConfigs: void;

  addUser: {};
  logout: { email: string };

  /* Emulator panel requests */
  getEmulatorUiSelections: void;
  getEmulatorInfos: void;
  updateEmulatorUiSelections: Partial<EmulatorUiSelections>;

  /** Notify extension that current user has been changed in UI. */
  requestChangeUser: { user: User | ServiceAccountUser };

  /** Trigger project selection */
  selectProject: {};

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

  connectToPostgres: void;
  disconnectPostgres: void;
  getInitialIsConnectedToPostgres: void;

  selectEmulatorImportFolder: {};

  definedDataConnectArgs: string;

  /** Prompts the user to select a directory in which to place the quickstart */
  chooseQuickstartDir: {};

  notifyAuthUserMockChange: UserMock;

  /** Deploy connectors/services to production */
  "fdc.deploy": void;

  /** Deploy all connectors/services to production */
  "fdc.deploy-all": void;

  /** Configures generated SDK */
  "fdc.configure-sdk": void;

  // Initialize "result" tab.
  getDataConnectResults: void;

  // execute terminal tasks
  executeLogin: void;
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

  notifyIsConnectedToPostgres: boolean;

  notifyPostgresStringChanged: string;

  /** Triggered when new environment variables values are found. */
  notifyEnv: { env: { isMonospace: boolean } };

  /** Triggered when users have been updated. */
  notifyUsers: { users: User[] };

  /** Triggered when a new project is selected */
  notifyProjectChanged: { projectId: string };

  /**
   * This can potentially call multiple webviews to notify of user selection.
   */
  notifyUserChanged: { user: User | ServiceAccountUser };

  /**
   * Notify webview of initial discovery or change in firebase.json or
   * .firebaserc
   */
  notifyFirebaseConfig: {
    firebaseJson: ValueOrError<FirebaseConfig> | undefined;
    firebaseRC: ValueOrError<RCData> | undefined;
  };
  /** Whether any dataconnect.yaml is present */
  notifyHasFdcConfigs: boolean;

  /**
   * Return user-selected preview channel name
   */
  notifyPreviewChannelResponse: { id: string };

  // data connect specific
  notifyDataConnectResults: DataConnectResults;
  notifyDataConnectRequiredArgs: { args: string[] };

  notifyIsLoadingUser: boolean;
}

export type MessageParamsMap =
  | WebviewToExtensionParamsMap
  | ExtensionToWebviewParamsMap;
