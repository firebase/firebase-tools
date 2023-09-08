import { computed, effect, signal } from "@preact/signals-react";
import { Disposable } from "vscode";
import { ServiceAccountUser } from "../types";
import { User as AuthUser } from "../../../src/types/auth";
import { ExtensionBrokerImpl } from "../extension-broker";
import { getAccounts, login, logoutUser } from "../cli";

type User = ServiceAccountUser | AuthUser;

/** Available user accounts */
const users = signal<Record<string /** email */, User>>({});

/** Currently selected user email */
const currentUserId = signal("");

/** Gets the currently selected user, fallback to first available user */
const currentUser = computed<User | undefined>(() => {
  return users.value[currentUserId.value] ?? Object.values(users.value)[0];
});

export function registerUser(broker: ExtensionBrokerImpl): Disposable {
  effect(() => {
    broker.send("notifyUsers", { users: Object.values(users.value) });
  });

  effect(() => {
    broker.send("notifyUserChanged", { user: currentUser.value });
  });

  broker.on("getInitialData", async () => {
    const accounts = await getAccounts();
    users.value = accounts.reduce(
      (cumm, curr) => ({ ...cumm, [curr.user.email]: curr.user }),
      {}
    );
  });

  broker.on("addUser", async () => {
    const { user } = await login();
    users.value = {
      ...users.value,
      [user.email]: user,
    };
    currentUserId.value = user.email;
  });

  broker.on("requestChangeUser", ({ user }) => {
    currentUserId.value = user.email;
  });

  broker.on("logout", async ({ email }) => {
    try {
      await logoutUser(email);
      const accounts = await getAccounts();
      users.value = accounts.reduce(
        (cumm, curr) => ({ ...cumm, [curr.user.email]: curr.user }),
        {}
      );
      currentUserId.value = "";
    } catch (e) {
      // ignored
    }
  });

  return {
    dispose() {},
  };
}
