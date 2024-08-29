import vscode, { Disposable, ExtensionContext, TelemetryLogger } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { getRootFolders, registerConfig } from "./config";
import { EmulatorsController } from "./emulators";
import { registerEnv } from "./env";
import { pluginLogger } from "../logger-wrapper";
import { getSettings } from "../utils/settings";
import { setEnabled } from "../../../src/experiments";
import { registerUser } from "./user";
import { registerProject } from "./project";
import { registerQuickstart } from "./quickstart";
import { registerOptions } from "../options";
import { upsertFile } from "../data-connect/file-utils";

export async function registerCore(
  broker: ExtensionBrokerImpl,
  context: ExtensionContext,
  telemetryLogger: TelemetryLogger,
): Promise<[EmulatorsController, vscode.Disposable]> {
  const settings = getSettings();

  if (settings.npmPath) {
    process.env.PATH += `:${settings.npmPath}`;
  }

  if (settings.useFrameworks) {
    setEnabled("webframeworks", true);
  }

  const sub1 = broker.on("writeLog", async ({ level, args }) => {
    pluginLogger[level]("(Webview)", ...args);
  });

  const sub2 = broker.on("showMessage", async ({ msg, options }) => {
    vscode.window.showInformationMessage(msg, options);
  });

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
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    vscode.tasks.executeTask(
      new vscode.Task(
        { type: "shell" }, // this is the same type as in tasks.json
        workspaceFolder, // The workspace folder
        "Firebase init", // how you name the task
        "Firebase init", // Shows up as MyTask: name
        new vscode.ShellExecution("firebase init"),
      ),
    );
  });

  const emulatorsController = new EmulatorsController(broker);
  // Start the emulators when the extension starts.
  emulatorsController.startEmulators();

  const openRcCmd = vscode.commands.registerCommand(
    "firebase.openFirebaseRc",
    () => {
      for (const root of getRootFolders()) {
        upsertFile(vscode.Uri.file(`${root}/.firebaserc`), () => "");
      }
    },
  );

  return [
    emulatorsController,
    Disposable.from(
      openRcCmd,
      emulatorsController,
      registerOptions(context),
      registerConfig(broker),
      registerEnv(broker),
      registerUser(broker, telemetryLogger),
      registerProject(broker),
      registerQuickstart(broker),
      { dispose: sub1 },
      { dispose: sub2 },
      { dispose: sub3 },
      { dispose: sub4 },
    ),
  ];
}
