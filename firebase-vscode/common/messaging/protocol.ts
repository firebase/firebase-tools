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

type DeepReadOnly<T> =
  T extends Record<any, unknown>
    ? { readonly [K in keyof T]: DeepReadOnly<T[K]> }
    : T extends Array<any>
      ? ReadonlyArray<DeepReadOnly<T[number]>>
      : T;

/** The `firemat.yaml` content */
export type FirematConfig = DeepReadOnly<{
  specVersion: string;
  schema: {
    main: {
      source: string;
      connection: {
        connectionString?: string;
      };
    };
  };
  operationSet: {
    crud: {
      source: string;
    };
  };
}>;

export interface WebviewToExtensionParamsMap {
  /**
   * Ask extension for initial data
   */
  getInitialData: {};
  addUser: {};
  logout: { email: string };

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

  /**
   * Equivalent to the `firebase emulators:start` command.
   */
  launchEmulators: {
    emulatorUiSelections: EmulatorUiSelections;
  };

  /** Stops the emulators gracefully allowing for data export if required. */
  stopEmulators: void;

  selectEmulatorImportFolder: {};

  definedFirematArgs: string;

  notifyFirematEmulatorEndpoint: { endpoint: string | undefined };

  /** Prompts the user to select a directory in which to place the quickstart */
  chooseQuickstartDir: {};

  notifyAuthUserMockChange: UserMock;

  /** Opens the "connect to instance" picker */
  connectToInstance: void;
}

export interface FirematResults {
  query: string;
  displayName: string;
  results?: ExecutionResult | SerializedError;
  args?: string;
}

export interface ExtensionToWebviewParamsMap {
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
    firebaseJson: FirebaseConfig | undefined;
    firebaseRC: RCData | undefined;
  };

  /**
   * Return user-selected preview channel name
   */
  notifyPreviewChannelResponse: { id: string };

  notifyEmulatorsStopped: void;
  notifyEmulatorStartFailed: void;
  notifyRunningEmulatorInfo: RunningEmulatorInfo;
  notifyEmulatorImportFolder: { folder: string };

  // firemat specific
  notifyFirematResults: FirematResults;
  notifyFirematRequiredArgs: { args: string[] };
}

export type MessageParamsMap =
  | WebviewToExtensionParamsMap
  | ExtensionToWebviewParamsMap;
