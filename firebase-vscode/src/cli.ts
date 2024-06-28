import * as vscode from "vscode";
import { inspect } from "util";

import {
  getAllAccounts,
  getGlobalDefaultAccount,
  loginGoogle,
  setGlobalDefaultAccount,
} from "../../src/auth";
import { logoutAction } from "../../src/commands/logout";
import { listFirebaseProjects } from "../../src/management/projects";
import { requireAuth } from "../../src/requireAuth";
import { Account, User } from "../../src/types/auth";
import { Options } from "../../src/options";
import { currentOptions, getCommandOptions } from "./options";
import { ServiceAccount } from "../common/types";
import { EmulatorUiSelections } from "../common/messaging/types";
import { pluginLogger } from "./logger-wrapper";
import { setAccessToken } from "../../src/apiv2";
import {
  startAll as startAllEmulators,
  cleanShutdown as stopAllEmulators,
} from "../../src/emulator/controller";
import { EmulatorRegistry } from "../../src/emulator/registry";
import {
  DownloadableEmulatorDetails,
  EmulatorInfo,
  DownloadableEmulators,
  Emulators,
} from "../../src/emulator/types";
import * as commandUtils from "../../src/emulator/commandUtils";
import { currentUser } from "./core/user";
import { firstWhere } from "./utils/signal";
export { Emulators };
/**
 * Try to get a service account by calling requireAuth() without
 * providing any account info.
 */
async function getServiceAccount() {
  let email = null;
  try {
    // Make sure no user/token is sent
    // to requireAuth which would prevent autoAuth() from being reached.
    // We do need to send isVSCE to prevent project selection popup
    const optionsMinusUser = await getCommandOptions(undefined, {
      ...currentOptions.value,
    });
    delete optionsMinusUser.user;
    delete optionsMinusUser.tokens;
    delete optionsMinusUser.token;
    email = (await requireAuth(optionsMinusUser)) || null;
  } catch (e) {
    let errorMessage = e.message;
    if (e.original?.message) {
      errorMessage += ` (original: ${e.original.message})`;
    }
    pluginLogger.debug(
      `No service account found (this may be normal), ` +
        `requireAuth error output: ${errorMessage}`,
    );
    return null;
  }
  if (process.env.WORKSPACE_SERVICE_ACCOUNT_EMAIL) {
    // If Monospace, get service account email using env variable as
    // the metadata server doesn't currently return the credentials
    // for the workspace service account. Remove when Monospace is
    // updated to return credentials through the metadata server.
    pluginLogger.debug(
      `Using WORKSPACE_SERVICE_ACCOUNT_EMAIL env ` +
        `variable to get service account email: ` +
        `${process.env.WORKSPACE_SERVICE_ACCOUNT_EMAIL}`,
    );
    return process.env.WORKSPACE_SERVICE_ACCOUNT_EMAIL;
  }
  pluginLogger.debug(
    `Got service account email through credentials:` + ` ${email}`,
  );
  return email;
}

/**
 * Wrap the CLI's requireAuth() which is normally run before every command
 * requiring user to be logged in. The CLI automatically supplies it with
 * account info if found in configstore so we need to fill that part in.
 */
async function requireAuthWrapper(showError: boolean = true): Promise<boolean> {
  // Try to get global default from configstore. For some reason this is
  pluginLogger.debug("requireAuthWrapper");
  let account = getGlobalDefaultAccount();
  // often overwritten when restarting the extension.
  if (!account) {
    // If nothing in configstore top level, grab the first "additionalAccount"
    const accounts = getAllAccounts();
    for (const additionalAccount of accounts) {
      if (additionalAccount.user.email === currentUser.value.email) {
        account = additionalAccount;
        setGlobalDefaultAccount(account);
      }
    }
  }
  const commandOptions = await getCommandOptions(undefined, {
    ...currentOptions.value,
  });
  // `requireAuth()` is not just a check, but will also register SERVICE
  // ACCOUNT tokens in memory as a variable in apiv2.ts, which is needed
  // for subsequent API calls. Warning: this variable takes precedence
  // over Google login tokens and must be removed if a Google
  // account is the current user.
  try {
    const serviceAccountEmail = await getServiceAccount();
    // Priority 1: Service account exists and is the current selected user
    if (
      serviceAccountEmail &&
      currentUser.value.email === serviceAccountEmail
    ) {
      // requireAuth should have been run and apiv2 token should be stored
      // already due to getServiceAccount() call above.
      return true;
    } else if (account) {
      // Priority 2: Google login account exists and is the currently selected
      // user
      // Priority 3: Google login account exists and there is no selected user
      // Clear service account access token from memory in apiv2.
      setAccessToken();
      await requireAuth({ ...commandOptions, ...account });
      return true;
    } else if (serviceAccountEmail) {
      // Priority 4: There is a service account but it's not set as
      // currentUser for some reason, but there also isn't an oauth account.
      // requireAuth was already run as part of getServiceAccount() above
      return true;
    }
    pluginLogger.debug("No user found (this may be normal)");
    return false;
  } catch (e) {
    if (showError) {
      // Show error to user - show a popup and log it with log level "error".
      pluginLogger.error(
        `requireAuth error: ${e.original?.message || e.message}`,
      );
      vscode.window.showErrorMessage("Not logged in", {
        modal: true,
        detail: `Log in by clicking "Sign in with Google" in the sidebar.`,
      });
    } else {
      // User shouldn't need to see this error - not actionable,
      // but we should log it for debugging purposes.
      pluginLogger.debug(
        "requireAuth error output: ",
        e.original?.message || e.message,
      );
    }
    return false;
  }
}

export async function getAccounts(): Promise<Array<Account | ServiceAccount>> {
  // Get Firebase login accounts
  const accounts: Array<Account | ServiceAccount> = getAllAccounts();
  pluginLogger.debug(`Found ${accounts.length} non-service accounts.`);
  // Get other accounts (assuming service account for now, could also be glogin)
  const serviceAccountEmail = await getServiceAccount();
  if (serviceAccountEmail) {
    pluginLogger.debug(`Found service account: ${serviceAccountEmail}`);
    accounts.push({
      user: { email: serviceAccountEmail, type: "service_account" },
    });
  }
  return accounts;
}

export async function logoutUser(email: string): Promise<void> {
  await logoutAction(email, {} as Options);
}

/**
 * Login with standard Firebase login
 */
export async function login() {
  const userCredentials = await loginGoogle(true);
  setGlobalDefaultAccount(userCredentials as Account);
  return userCredentials as { user: User };
}

export async function listProjects() {
  const loggedIn = await requireAuthWrapper(false);
  if (!loggedIn) {
    return [];
  }
  return listFirebaseProjects();
}

export async function emulatorsStart(
  emulatorUiSelections: EmulatorUiSelections,
) {
  const only = emulatorUiSelections.mode === "dataconnect"
        ? `${Emulators.DATACONNECT},${Emulators.AUTH}`
        : "";
  const commandOptions = await getCommandOptions(undefined, {
    ...(await firstWhere(
      // TODO use firstWhereDefined once currentOptions are undefined if not initialized yet
      currentOptions,
      (op) => !!op && op.configPath.length !== 0,
    )),
    project: emulatorUiSelections.projectId,
    exportOnExit: emulatorUiSelections.exportStateOnExit,
    import: emulatorUiSelections.importStateFolderPath,
    only,
  });
  // Adjusts some options, export on exit can be a boolean or a path.
  commandUtils.setExportOnExitOptions(
    commandOptions as commandUtils.ExportOnExitOptions,
  );
  return startAllEmulators(commandOptions, /*showUi=*/ true);
}

export async function stopEmulators() {
  await stopAllEmulators();
}

export function listRunningEmulators(): EmulatorInfo[] {
  return EmulatorRegistry.listRunningWithInfo();
}

export function getEmulatorUiUrl(): string | undefined {
  const url: URL = EmulatorRegistry.url(Emulators.UI);
  return url.hostname === "unknown" ? undefined : url.toString();
}

export function getEmulatorDetails(
  emulator: DownloadableEmulators,
): DownloadableEmulatorDetails {
  return EmulatorRegistry.getDetails(emulator);
}
