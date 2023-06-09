/**
 * @fileoverview Lists all possible messages that can be passed back and forth
 * between two environments (VScode and Webview)
 */

import { FirebaseConfig } from '../../../src/firebaseConfig';
import { FirebaseRC } from "../firebaserc";
import { User } from "../../../src/types/auth";
import { ServiceAccountUser } from "../types";
import { EmulatorInfo } from "../emulator/types";

export interface WebviewToExtensionParamsMap {
  /**
   * Ask extension for env variables
   */
  getEnv: {};
  /**
   * User management
   */
  getUsers: {};
  addUser: {};
  logout: { email: string };

  /** Notify extension that current user has been changed in UI. */
  requestChangeUser: { user: User | ServiceAccountUser };

  /** Trigger project selection */
  selectProject: { email: string };
  /**
   * Runs `firebase init hosting` command.
   * TODO(hsubox76): Generalize to work for all `firebase init` products.
   */
  selectAndInitHostingFolder: {
    projectId: string,
    email: string,
    singleAppSupport: boolean
  };

  /**
   * Get hosting channels.
   */
  getChannels: {};

  /**
   * Runs `firebase deploy` for hosting.
   * TODO(hsubox76): Generalize to work for all `firebase deploy` targets.
   */
  hostingDeploy: {
    target: string
  };

  /**
   * Get currently selected Firebase project from extension runtime.
   */
  getSelectedProject: {};

  /**
   * Fetches the contents of the .firebaserc and firebase.json config files.
   * If either or both files do not exist, then it will return a default
   * value.
   */
  getFirebaseJson: {};

  /**
   * Show a UI message using the vscode interface
   */
  showMessage: { msg: string, options?: {} };

  /**
   * Write a log to the extension logger.
   */
  writeLog: { level: string, args: string[] };

  /**
   * Call extension runtime to open a link (a href does not work in Monospace)
   */
  openLink: {
    href: string
  };

  /** 
   * Equivalent to the `firebase emulators:start` command.
  */
  launchEmulators : {
    firebaseJson: FirebaseConfig,
    emulatorUiSelections: EmulatorUiSelections,
  };

  /** Stops the emulators gracefully allowing for data export if required. */
  stopEmulators: {};

  selectEmulatorImportFolder: {};
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
  notifyUserChanged: { email: string };

  /**
   * Notifies webview when user has successfully selected a hosting folder
   * and it has been written to firebase.json.
   */
  notifyHostingFolderReady: { projectId: string, folderPath: string };

  /**
   * Notify webview of status of deployment attempt.
   */
  notifyHostingDeploy: {
    success: boolean,
    consoleUrl?: string,
    hostingUrl?: string
  };

  /**
   * Notify webview of initial discovery or change in firebase.json or
   * .firebaserc
   */
  notifyFirebaseConfig: { firebaseJson: FirebaseConfig, firebaseRC: FirebaseRC };

  notifyEmulatorsStopped: {};
  notifyRunningEmulatorInfo: RunningEmulatorInfo ;
  notifyEmulatorImportFolder: { folder: string };
}

export type MessageParamsMap = WebviewToExtensionParamsMap | ExtensionToWebviewParamsMap;

/**
 * Info to display in the UI while the emulators are running
 */
export interface RunningEmulatorInfo {
  uiUrl: string;
  displayInfo: EmulatorInfo[];
}

export interface EmulatorUiSelections {
  projectId: string
  firebaseJsonPath?: string
  importStateFolderPath?: string
  exportStateOnExit: boolean
  mode: "hosting" | "all"
  debugLogging: boolean
}
