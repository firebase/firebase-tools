import * as vscode from "vscode";
import { inspect } from "util";

import {
  getAllAccounts,
  getGlobalDefaultAccount,
  loginGoogle,
  setGlobalDefaultAccount,
} from "../../src/auth";
import { logoutAction } from "../../src/commands/logout";
import { hostingChannelDeployAction } from "../../src/commands/hosting-channel-deploy";
import { listFirebaseProjects } from "../../src/management/projects";
import { requireAuth } from "../../src/requireAuth";
import { deploy } from "../../src/deploy";
import { FirebaseConfig, HostingSingle } from "../../src/firebaseConfig";
import { FirebaseRC } from "../common/firebaserc";
import { getDefaultHostingSite } from "../../src/getDefaultHostingSite";
import { initAction } from "../../src/commands/init";
import { Account, User } from "../../src/types/auth";
import { Options } from "../../src/options";
import { currentOptions, getCommandOptions } from "./options";
import { setInquirerOptions } from "./stubs/inquirer-stub";
import { ServiceAccount } from "../common/types";
import { listChannels } from "../../src/hosting/api";
import { ChannelWithId } from "../common/messaging/types";
import { pluginLogger } from "./logger-wrapper";

/**
 * Wrap the CLI's requireAuth() which is normally run before every command
 * requiring user to be logged in. The CLI automatically supplies it with
 * account info if found in configstore so we need to fill that part in.
 */
async function requireAuthWrapper(showError: boolean = true) {
  // Try to get global default from configstore. For some reason this is
  // often overwritten when restarting the extension.
  let account = getGlobalDefaultAccount();
  if (!account) {
    // If nothing in configstore top level, grab the first "additionalAccount"
    const accounts = getAllAccounts();
    if (accounts.length > 0) {
      account = accounts[0];
      setGlobalDefaultAccount(account);
    }
  }
  // If account is still null, `requireAuth()` will use google-auth-library
  // to look for the service account hopefully.
  try {
    const commandOptions = await getCommandOptions(undefined, {
      ...currentOptions,
      ...account,
    });
    await requireAuth(commandOptions);
  } catch (e) {
    if (showError) {
      pluginLogger.error('requireAuth error', e.original || e);
      vscode.window.showErrorMessage("Not logged in", {
        modal: true,
        detail: `Log in by clicking "Sign in with Google" in the sidebar.`,
      });
    } else {
      // If "showError" is false, this may not be an error, just an indication
      // no one is logged in. Log to "debug".
      pluginLogger.debug('No user found (this may be normal), requireAuth error output:',
        e.original || e);
    }
    return false;
  }
  // No accounts but no error on requireAuth means it's a service account
  // (or glogin - edge case)
  return true;
}

export async function getAccounts(): Promise<Array<Account | ServiceAccount>> {
  // Get Firebase login accounts
  const accounts: Array<Account | ServiceAccount> = getAllAccounts();
  pluginLogger.debug(`Found ${accounts.length} non-service accounts.`);
  // Get other accounts (assuming service account for now, could also be glogin)
  const otherAuthExists = await requireAuthWrapper(false);
  if (otherAuthExists) {
    pluginLogger.debug(`Found service account`);
    accounts.push({
      user: { email: "service_account", type: "service_account" },
    });
  }
  return accounts;
}

export async function getChannels(firebaseJSON: FirebaseConfig): Promise<ChannelWithId[]> {
  if (!firebaseJSON) {
    return [];
  }
  const loggedIn = await requireAuthWrapper(false);
  if (!loggedIn) {
    return [];
  }
  const options = { ...currentOptions };
  if (!options.project) {
    return [];
  }
  // TODO(hsubox76): handle multiple hosting configs
  if (!(firebaseJSON.hosting as HostingSingle).site) {
    (firebaseJSON.hosting as HostingSingle).site =
      await getDefaultHostingSite(options);
  }
  pluginLogger.debug(
    'Calling listChannels with params',
    options.project,
    (firebaseJSON.hosting as HostingSingle).site
  );
  try {
    const channels = await listChannels(options.project, (firebaseJSON.hosting as HostingSingle).site);
    return channels.map(channel => ({
      ...channel, id: channel.name.split("/").pop()
    }));
  } catch (e) {
    pluginLogger.error('Error on listChannels()', e);
    vscode.window.showErrorMessage("Error finding hosting channels", {
      modal: true,
      detail: `Error finding hosting channels: ${e}`,
    });
    return [];
  }
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

export async function initHosting(options: { spa: boolean; public?: string }) {
  await requireAuthWrapper();
  let webFrameworksOptions = {};
  // Empty public param means this is a web frameworks setup.
  if (!options.public) {
    pluginLogger.debug('Setting web frameworks options');
    webFrameworksOptions = {
      // Should use auto-discovered framework
      useDiscoveredFramework: true,
      // Should set up a new framework - do not do this on Monospace
      useWebFrameworks: false
    };
  }
  const commandOptions = await getCommandOptions(undefined, currentOptions);
  const inquirerOptions = {
    ...commandOptions,
    ...options,
    ...webFrameworksOptions,
    // False for now, we can let the user decide if needed
    github: false
  };
  pluginLogger.debug('Calling hosting init with inquirer options', inspect(inquirerOptions));
  setInquirerOptions(inquirerOptions);
  await initAction("hosting", commandOptions);
}

export async function deployToHosting(
  firebaseJSON: FirebaseConfig,
  firebaseRC: FirebaseRC,
  deployTarget: string
) {
  if (!(await requireAuthWrapper())) {
    return { success: false, hostingUrl: "", consoleUrl: "" };
  }

  // TODO(hsubox76): throw if it doesn't find firebaseJSON or the hosting field
  try {
    const options = { ...currentOptions };
    // TODO(hsubox76): handle multiple hosting configs
    if (!(firebaseJSON.hosting as HostingSingle).site) {
      pluginLogger.debug('Calling getDefaultHostingSite() with options', inspect(options));
      (firebaseJSON.hosting as HostingSingle).site =
        await getDefaultHostingSite(options);
    }
    pluginLogger.debug('Calling getCommandOptions() with options', inspect(options));
    const commandOptions = await getCommandOptions(firebaseJSON, options);
    pluginLogger.debug('Calling hosting deploy with command options', inspect(commandOptions));
    if (deployTarget === 'live') {
      await deploy(["hosting"], commandOptions);
    } else {
      await hostingChannelDeployAction(deployTarget, commandOptions);
    }
    pluginLogger.debug('Hosting deploy complete');
  } catch (e) {
    let message = `Error deploying to hosting`;
    if (e.message) {
      message += `: ${e.message}`;
    }
    if (e.original) {
      message += ` (original: ${e.original})`;
    }
    pluginLogger.error(message);
    return { success: false, hostingUrl: "", consoleUrl: "" };
  }
  return { success: true, hostingUrl: "", consoleUrl: "" };
}
