/**
 * @fileoverview Lists all possible messages that can be passed back and forth
 * between two environments (VScode and Webview)
 */

import { FirebaseConfig } from "../../../src/firebaseConfig";
import { User } from "../../../src/types/auth";
import { ServiceAccountUser } from "../types";
import { RCData } from "../../../src/rc";
import { EmulatorsStatus, RunningEmulatorInfo } from "./types";
import { ExecutionResult } from "graphql";
import { SerializedError } from "../error";

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
  getInitialFirebaseConfigList: void;

  addUser: {};
  logout: { email: string };

  /* Emulator panel requests */
  getEmulatorUiSelections: void;
  getEmulatorInfos: void;

  /** Notify extension that current user has been changed in UI. */
  requestChangeUser: { user: User | ServiceAccountUser };

  /** Trigger project selection */
  selectProject: {};

  /** When 2+ firebase.json are detected, the user can manually pick one */
  selectFirebaseConfig: string;

  /**
   * Prompt user for text input
   */
  promptUserForInput: { title: string; prompt: string };

  /** Calls the `firebase init` CLI */
  runFirebaseInit: void;

  /** Calls the `firebase emulators:start` CLI */
  runStartEmulators: void;

  /** Calls the `firebase emulators:export` CLI */
  runEmulatorsExport: void;

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

  /** Opens generated docs */
  "fdc.open-docs": void;

  /** Opens settings page searching for Data Connect emualtor settings */
  "fdc.open-emulator-settings": void;

  /** Clears data from a running data connect emulator */
  "fdc.clear-emulator-data": void;

  // Initialize "result" tab.
  getDataConnectResults: void;

  // execute terminal tasks
  executeLogin: void;

  getDocsLink: void;

  openJSONFile: string;

  // called from execution panel
  rerunExecution: void;
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
  notifyEmulatorStateChanged: {
    status: EmulatorsStatus;
    infos?: RunningEmulatorInfo | undefined;
  };

  /** Lists all firebase.json in the workspace */
  notifyFirebaseConfigListChanged: {
    values: string[];
    selected: string | undefined;
  };

  notifyEmulatorsHanging: boolean;

  /** Triggered when new environment variables values are found. */
  notifyEnv: { env: { isMonospace: boolean } };

  /** Triggered when users have been updated. */
  notifyUsers: { users: User[] };

  /** Triggered when a new project is selected */
  notifyProjectChanged: { projectId: string };

  /**
   * This can potentially call multiple webviews to notify of user selection.
   */
  notifyUserChanged: { user: User | ServiceAccountUser | null };

  /**
   * Notify webview of initial discovery or change in firebase.json or
   * .firebaserc
   */
  notifyFirebaseConfig: {
    firebaseJson?: ValueOrError<FirebaseConfig | undefined>;
    firebaseRC?: ValueOrError<RCData | undefined>;
  };
  /** Whether any dataconnect.yaml is present */
  notifyHasFdcConfigs: boolean;

  /**
   * Return user-selected preview channel name
   */
  notifyPreviewChannelResponse: { id: string };

  // data connect specific
  notifyDataConnectArgs: string;

  notifyDataConnectResults: DataConnectResults;

  notifyLastOperation: string;

  notifyIsLoadingUser: boolean;

  notifyDocksLink: string;
}

export type MessageParamsMap =
  | WebviewToExtensionParamsMap
  | ExtensionToWebviewParamsMap;
