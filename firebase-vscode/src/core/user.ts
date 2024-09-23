import { Signal, computed, effect } from "@preact/signals-react";
import { Disposable, TelemetryLogger } from "vscode";
import { ServiceAccountUser } from "../types";
import { User as AuthUser } from "../../../src/types/auth";
import { ExtensionBrokerImpl } from "../extension-broker";
import { login, logoutUser, requireAuthWrapper } from "../cli";
import { globalSignal } from "../utils/globals";
import { DATA_CONNECT_EVENT_NAME } from "../analytics";
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
  telemetryLogger: TelemetryLogger,
): Disposable {
  const notifyUserChangedSub = effect(() => {
    broker.send("notifyUserChanged", { user: currentUser.value });
  });

  const getInitialDataSub = broker.on("getInitialData", async () => {
    isLoadingUser.value = true;
    currentUser.value = await checkLogin();
    isLoadingUser.value = false;
  });

  const isLoadingSub = effect(() => {
    broker.send("notifyIsLoadingUser", isLoadingUser.value);
  });

  const addUserSub = broker.on("addUser", async () => {
    telemetryLogger.logUsage(DATA_CONNECT_EVENT_NAME.LOGIN);
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
  );
}
