import vscode, { Disposable, ExtensionContext } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { registerConfig } from "./config";
import { EmulatorsController } from "./emulators";
import { registerEnv } from "./env";
import { pluginLogger } from "../logger-wrapper";
import { getSettings } from "../utils/settings";
import { setEnabled } from "../../../src/experiments";
import { registerUser } from "./user";
import { registerProject } from "./project";
import { registerQuickstart } from "./quickstart";

export function registerCore({
  broker,
  context,
}: {
  broker: ExtensionBrokerImpl;
  context: ExtensionContext;
}): [EmulatorsController, Disposable] {
  const settings = getSettings();

  if (settings.npmPath) {
    process.env.PATH += `:${settings.npmPath}`;
  }

  if (settings.useFrameworks) {
    setEnabled("webframeworks", true);
  }

  broker.on("writeLog", async ({ level, args }) => {
    pluginLogger[level]("(Webview)", ...args);
  });

  broker.on("showMessage", async ({ msg, options }) => {
    vscode.window.showInformationMessage(msg, options);
  });

  broker.on("openLink", async ({ href }) => {
    vscode.env.openExternal(vscode.Uri.parse(href));
  });

  const emulatorsController = new EmulatorsController(broker);

  return [
    emulatorsController,
    Disposable.from(
      registerConfig(broker),
      emulatorsController,
      registerEnv(broker),
      registerUser(broker),
      registerProject({ context, broker }),
      registerQuickstart(broker),
    ),
  ];
}
