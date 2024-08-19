import { Disposable } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { pluginLogger } from "../logger-wrapper";
import { globalSignal } from "../utils/globals";

interface Environment {
  isMonospace: boolean;
}

export const env = globalSignal<Environment>({
  isMonospace: Boolean(process.env.MONOSPACE_ENV),
});

export function registerEnv(broker: ExtensionBrokerImpl): Disposable {
  const sub = broker.on("getInitialData", async () => {
    pluginLogger.debug(
      `Value of process.env.MONOSPACE_ENV: ` + `${process.env.MONOSPACE_ENV}`
    );

    broker.send("notifyEnv", {
      env: env.peek(),
    });
  });

  return { dispose: sub };
}
