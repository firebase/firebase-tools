import { z } from "zod";
import * as clc from "colorette";
import { tool } from "../../tool";
import { toContent } from "../../util";
import {
  getAllAccounts,
  getGlobalDefaultAccount,
  getAdditionalAccounts,
  setRefreshToken,
  logout,
  setGlobalDefaultAccount,
} from "../../../auth";
import { logger } from "../../../logger";

export const firebase_logout = tool(
  {
    name: "firebase_logout",
    description: "Log the CLI out of Firebase",
    inputSchema: z.object({
      email: z
        .string()
        .optional()
        .describe(
          "The email of the account to log out. If not provided, all accounts will be logged out.",
        ),
    }),
    _meta: {
      requiresAuth: false,
      requiresProject: false,
    },
  },
  async ({ email }) => {
    const allAccounts = getAllAccounts();
    if (allAccounts.length === 0) {
      return toContent("No need to logout, not logged in");
    }

    const defaultAccount = getGlobalDefaultAccount();
    const additionalAccounts = getAdditionalAccounts();

    const accountsToLogOut = email
      ? allAccounts.filter((a) => a.user.email === email)
      : allAccounts;

    if (email && accountsToLogOut.length === 0) {
      return toContent(`No account matches ${email}, can't log out.`);
    }

    // If they are logging out of their primary account, choose one to
    // replace it.
    const logoutDefault = email === defaultAccount?.user.email;
    let newDefaultAccount = undefined;
    if (logoutDefault && additionalAccounts.length > 0) {
      newDefaultAccount = additionalAccounts[0];
    }

    const logoutMessages = [];
    for (const account of accountsToLogOut) {
      const token = account.tokens.refresh_token;

      if (token) {
        setRefreshToken(token);
        try {
          await logout(token);
          logoutMessages.push(`Logged out from ${clc.bold(account.user.email)}`);
        } catch (e: unknown) {
          if (e instanceof Error) {
            logger.debug(e.message);
          }
          logoutMessages.push(
            `Could not deauthorize ${account.user.email}, assuming already deauthorized.`,
          );
        }
      }
    }

    if (newDefaultAccount) {
      setGlobalDefaultAccount(newDefaultAccount);
      logoutMessages.push(`Setting default account to "${newDefaultAccount.user.email}"`);
    }
    return toContent(logoutMessages.join("\n"));
  },
);
