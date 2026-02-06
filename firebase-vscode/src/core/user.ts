import { Signal, computed, effect } from "@preact/signals-react";
import { Disposable } from "vscode";
import { ServiceAccountUser } from "../types";
import { User as AuthUser } from "../../../src/types/auth";
import { ExtensionBrokerImpl } from "../extension-broker";
import { login, logoutUser, requireAuthWrapper } from "../cli";
import { globalSignal } from "../utils/globals";
import { DATA_CONNECT_EVENT_NAME, AnalyticsLogger } from "../analytics";
import * as vscode from "vscode";

type User = ServiceAccountUser | AuthUser;

/** Currently selected user */
export const currentUser = globalSignal<User | null>(null);
const isLoadingUser = new Signal<boolean>(false);

export const isServiceAccount = computed(() => {
  return (currentUser.value as ServiceAccountUser)?.type === "service_account";
});

export async function checkLogin() {
  return await requireAuthWrapper();
}

export function registerUser(
  broker: ExtensionBrokerImpl,
  analyticsLogger: AnalyticsLogger,
): Disposable {
  // For testing purposes.
  const userMockCommand = vscode.commands.registerCommand(
    `fdc-graphql.mock.user`,
    (user: User | null) => {
      currentUser.value = user;
      broker.send("notifyUserChanged", { user });
    },
  );

  // For testing purposes.
  const loadingUser = vscode.commands.registerCommand(
    `fdc-graphql.user`,
    () => {
      return isLoadingUser.value;
    },
  );

  const getInitialData = async () => {
    isLoadingUser.value = true;
    currentUser.value = await checkLogin();
    isLoadingUser.value = false;
  };

  getInitialData();

  const notifyUserChangedSub = effect(() => {
    broker.send("notifyUserChanged", { user: currentUser.value });
  });

  const getInitialDataSub = broker.on("getInitialData", async () => {
    await getInitialData();
  });

  const isLoadingSub = effect(() => {
    broker.send("notifyIsLoadingUser", isLoadingUser.value);
  });

  const addUserSub = broker.on("addUser", async () => {
    analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.LOGIN);
    const { user } = await login();
    currentUser.value = user;
  });

  const logoutSub = broker.on("logout", async ({ email }) => {
    try {
      await logoutUser(email);
      currentUser.value = null;
    } catch (e) {
      // ignored
    }
  });

  return Disposable.from(
    { dispose: notifyUserChangedSub },
    { dispose: getInitialDataSub },
    { dispose: addUserSub },
    { dispose: logoutSub },
    { dispose: isLoadingSub },
    userMockCommand,
    loadingUser,
  );
}
