import vscode, { Disposable, ExtensionContext } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { getRootFolders, registerConfig } from "./config";
import { EmulatorsController } from "./emulators";
import { registerEnv } from "./env";
import { pluginLogger, LogLevel } from "../logger-wrapper";
import { getSettings } from "../utils/settings";
import { setEnabled } from "../../../src/experiments";
import { registerUser } from "./user";
import { currentProjectId, registerProject } from "./project";
import { registerQuickstart } from "./quickstart";
import { registerOptions } from "../options";
import { upsertFile } from "../data-connect/file-utils";
import { registerWebhooks } from "./webhook";
import { createE2eMockable } from "../utils/test_hooks";
import { runTerminalTask } from "../data-connect/terminal";
import { AnalyticsLogger } from "../analytics";

export async function registerCore(
  broker: ExtensionBrokerImpl,
  context: ExtensionContext,
  analyticsLogger: AnalyticsLogger,
): Promise<[EmulatorsController, vscode.Disposable]> {
  const settings = getSettings();

  // Wrap the runTerminalTask function to allow for e2e testing.
  const initSpy = createE2eMockable(
    async (...args: Parameters<typeof runTerminalTask>) => {
      await runTerminalTask(...args);
    },
    "init",
    async () => {},
  );

  if (settings.npmPath) {
    process.env.PATH += `:${settings.npmPath}`;
  }

  if (settings.useFrameworks) {
    setEnabled("webframeworks", true);
  }

  const sub1 = broker.on("writeLog", async ({ level, args }) => {
    pluginLogger[level as LogLevel]("(Webview)", ...args);
  });

  const sub2 = broker.on(
    "showMessage",
    async ({ msg, options }: { msg: string; options?: any }) => {
      vscode.window.showInformationMessage(msg, options);
    },
  );

  const sub3 = broker.on("openLink", async ({ href }) => {
    vscode.env.openExternal(vscode.Uri.parse(href));
  });

  const sub4 = broker.on("runFirebaseInit", async () => {
    // Check if the user has a workspace open
    if (
      !vscode.workspace.workspaceFolders ||
      vscode.workspace.workspaceFolders.length === 0
    ) {
      vscode.window.showErrorMessage(
        "You must have a workspace open to run firebase init.",
      );
      return;
    }
    const initCommand = currentProjectId.value
      ? `${settings.firebasePath} init dataconnect --project ${currentProjectId.value}`
      : `${settings.firebasePath} init dataconnect`;

    initSpy.call("firebase init", initCommand, { focus: true });
  });

  const emulatorsController = new EmulatorsController(broker);

  const openRcCmd = vscode.commands.registerCommand(
    "firebase.openFirebaseRc",
    () => {
      for (const root of getRootFolders()) {
        upsertFile(vscode.Uri.file(`${root}/.firebaserc`), () => "");
      }
    },
  );

  registerConfig(context, broker);
  const refreshCmd = vscode.commands.registerCommand(
    "firebase.refresh",
    async () => {
      await vscode.commands.executeCommand("workbench.action.closeSidebar");
      await vscode.commands.executeCommand(
        "workbench.view.extension.firebase-data-connect",
      );
    },
  );

  return [
    emulatorsController,
    Disposable.from(
      openRcCmd,
      refreshCmd,
      emulatorsController,
      initSpy,
      registerOptions(context),
      registerEnv(broker),
      registerUser(broker, analyticsLogger),
      registerProject(broker, analyticsLogger),
      registerQuickstart(broker),
      await registerWebhooks(),
      { dispose: sub1 },
      { dispose: sub2 },
      { dispose: sub3 },
      { dispose: sub4 },
    ),
  ];
}
