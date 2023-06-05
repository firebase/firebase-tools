/**
 * @fileoverview Lists all possible messages that can be passed back and forth
 * between two environments (VScode and Webview)
 */

import { FirebaseConfig } from  '../../../src/firebaseConfig';
import { FirebaseRC } from "../firebaserc";
import { User } from "../../../src/types/auth";
import { ServiceAccountUser } from "../types";

// Messages sent from Webview to extension
export interface WebviewToExtension {
  getEnv(): void;

  /* --- working with CLI: user management --- */
  getUsers(): void;
  addUser(): void;
  logout(email: string): void;

  /** Notify extension that current user has been changed. */
  requestChangeUser(user: User | ServiceAccountUser): void;

  /** Select a project */
  selectProject(email: string): void;

  /**
   * Runs `firebase init hosting` command.
   * TODO(hsubox76): Generalize to work for all `firebase init` products.
   */
  selectAndInitHostingFolder(
    projectId: string,
    email: string,
    singleAppSupport: boolean
  ): void;

  getChannels(): void;

  /**
   * Runs `firebase deploy` for hosting.
   * TODO(hsubox76): Generalize to work for all `firebase deploy` targets.
   */
  hostingDeploy(target: string): void;

  /** fetches a list of folders in the user's workspace. */
  getWorkspaceFolders(): void;

  /** get selected project either from firebaserc or last cached value (or workspace file) */
  getSelectedProject(): void;

  /**
   * Fetches the contents of the .firebaserc and firebase.json config files.
   * If either or both files do not exist, then it will return a default
   * value.
   */
  getFirebaseJson(): void;

  showMessage(msg: string, options?: {}): void;

  openLink(href: string): void;
}

// Messages sent from Extension to Webview
export interface ExtensionToWebview {
  notifyEnv(env: { isMonospace: boolean }): void;
  /** Called as a result of getUsers/addUser/logout calls */
  notifyUsers(users: User[]): void;

  notifyChannels(channels: any[]): void;

  /** Called when a new project is selected */
  notifyProjectChanged(projectId: string): void;

  /**
   * This can potentially call multiple webviews to notify of user selection.
   */
  notifyUserChanged(email: string): void;

  /**
   * Notifies webview when user has successfully selected a hosting folder
   * and it has been written to firebase.json.
   */
  notifyHostingFolderReady(projectId: string, folderPath: string): void;

  /**
   * Notify webview of status of deployment attempt.
   * @param success - true if deployment was a success
   * @param consoleUrl - url of Firebase console for this project
   * @param hostingUrl - hosting url for this deploy
   */
  notifyHostingDeploy(
    success: boolean,
    consoleUrl?: string,
    hostingUrl?: string
  ): void;

  /**
   * Notify webview of initial discovery or change in firebase.json or
   * .firebaserc
   */
  notifyFirebaseConfig(firebaseJson: FirebaseConfig, firebaseRC: FirebaseRC): void;
}
