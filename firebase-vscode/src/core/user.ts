import { computed, effect } from "@preact/signals-react";
import { Disposable } from "vscode";
import { ServiceAccountUser } from "../types";
import { User as AuthUser } from "../../../src/types/auth";
import { ExtensionBrokerImpl } from "../extension-broker";
import { getAccounts, login, logoutUser } from "../cli";
import { globalSignal } from "../utils/globals";

type User = ServiceAccountUser | AuthUser;

/** Available user accounts */
export const users = globalSignal<Record<string /** email */, User>>({});

/** Currently selected user email */
export const currentUserId = globalSignal("");

/** Gets the currently selected user, fallback to first available user */
export const currentUser = computed<User | undefined>(() => {
  return users.value[currentUserId.value] ?? Object.values(users.value)[0];
});

export const isServiceAccount = computed(() => {
  return (currentUser.value as ServiceAccountUser)?.type === "service_account";
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
