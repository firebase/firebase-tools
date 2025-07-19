import { Disposable } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { pluginLogger } from "../logger-wrapper";
import { globalSignal } from "../utils/globals";
import { isFirebaseStudio } from "../env";

interface Environment {
  isMonospace: boolean;
}

export const env = globalSignal<Environment>({
  isMonospace: isFirebaseStudio(),
});

export function registerEnv(broker: ExtensionBrokerImpl): Disposable {
  const sub = broker.on("getInitialData", async () => {
    pluginLogger.debug(`Value of isFirebaseStudio: ` + `${isFirebaseStudio()}`);

    broker.send("notifyEnv", {
      env: env.peek(),
    });
  });

  return { dispose: sub };
}
