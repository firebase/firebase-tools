import {
  getAllAccounts,
  getGlobalDefaultAccount,
  loginGoogle,
  setGlobalDefaultAccount,
} from "../../src/auth";
import { logoutAction } from "../../src/commands/logout";
import { listFirebaseProjects } from "../../src/management/projects";
import { requireAuth } from "../../src/requireAuth";
import { Account, Tokens, User } from "../../src/types/auth";
import { Options } from "../../src/options";
import { currentOptions } from "./options";
import { pluginLogger } from "./logger-wrapper";
import { getAccessToken, setAccessToken } from "../../src/apiv2";
import { EmulatorRegistry } from "../../src/emulator/registry";
import {
  DownloadableEmulatorDetails,
  EmulatorInfo,
  DownloadableEmulators,
  Emulators,
} from "../../src/emulator/types";
import { currentUser } from "./core/user";
import { currentProjectId } from "./core/project";
import { updateFirebaseRCProject } from "./core/config";
export { Emulators };
/**
 * Wrap the CLI's requireAuth() which is normally run before every command
 * requiring user to be logged in. The CLI automatically supplies it with
 * account info if found in configstore so we need to fill that part in.
 *
 */
export async function requireAuthWrapper(
  showError: boolean = true,
): Promise<User | null> {
  // Try to get global default from configstore
  pluginLogger.debug("requireAuthWrapper");
  let account = getGlobalDefaultAccount();
  // often overwritten when restarting the extension.
  const accounts = getAllAccounts();

  // helper to determine if VSCode options has the same account as global default
  function isUserMatching(account: Account, options: Options) {
    if (!options.user || !options.tokens) {
      return false;
    }

    const optionsUser = options.user as User;
    const optionsTokens = options.tokens as Tokens;
    return (
      account &&
      account.user?.email === optionsUser.email &&
      account.tokens.refresh_token === optionsTokens.refresh_token // Should check refresh token which is consistent, not access_token which is short lived.
    );
  }

  // only add account options when vscode is missing account information
  if (!isUserMatching(account!, currentOptions.value)) {
    currentOptions.value = { ...currentOptions.value, ...account };
  }

  if (!account) {
    // If nothing in configstore top level, grab the first "additionalAccount"
    for (const additionalAccount of accounts) {
      if (additionalAccount.user.email === currentUser.value!.email) {
        account = additionalAccount;
        setGlobalDefaultAccount(account);
      }
    }
  }
  // `requireAuth()` is not just a check, but will also register SERVICE
  // ACCOUNT tokens in memory as a variable in apiv2.ts, which is needed
  // for subsequent API calls. Warning: this variable takes precedence
  // over Google login tokens and must be removed if a Google
  // account is the current user.
  try {
    const optsCopy = currentOptions.value;
    const userEmail = await requireAuth(optsCopy); // client email
    // SetAccessToken is necessary here to ensure that access_tokens are available when:
    // - we are using tokens from configstore (aka those set by firebase login), AND
    // - we are calling CLI code that skips Command (where we normally call this)
    currentOptions.value = optsCopy;
    if (optsCopy.projectId) {
      updateFirebaseRCProject({
        projectAlias: { alias: "default", projectId: optsCopy.projectId },
      });
    }
    setAccessToken(await getAccessToken());
    if (userEmail) {
      pluginLogger.debug("User found: ", userEmail);

      // VSCode only has the concept of a single user
      return getGlobalDefaultAccount()!.user;
    }

    pluginLogger.debug("No user found (this may be normal)");
    return null;
  } catch (e: any) {
    if (showError) {
      // Show error to user - show a popup and log it with log level "error".
      pluginLogger.error(
        `requireAuth error: ${e.original?.message || e.message}`,
      );
    } else {
      // User shouldn't need to see this error - not actionable,
      // but we should log it for debugging purposes.
      pluginLogger.debug(
        "requireAuth error output: ",
        e.original?.message || e.message,
      );
    }
    return null;
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
  return listFirebaseProjects();
}

export function listRunningEmulators(): EmulatorInfo[] {
  return EmulatorRegistry.listRunningWithInfo();
}

export function getEmulatorUiUrl(): string | undefined {
  try {
    const url: URL = EmulatorRegistry.url(Emulators.UI);
    return url.hostname === "unknown" ? undefined : url.toString();
  } catch {
    return undefined;
  }
}

export function getEmulatorDetails(
  emulator: DownloadableEmulators,
): DownloadableEmulatorDetails {
  return EmulatorRegistry.getDetails(emulator);
}
