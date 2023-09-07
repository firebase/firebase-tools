import * as vscode from "vscode";
import { Settings } from "../../common/types";

export function getSettings(): Settings {
  // Get user-defined VSCode settings if workspace is found.
  const settings: Settings = {
    shouldWriteDebug: false,
    debugLogPath: "",
    featuresEnabled: {},
    npmPath: ""
  };
  if (vscode.workspace.workspaceFolders) {
    const workspaceConfig = vscode.workspace.getConfiguration(
      "firebase",
      vscode.workspace.workspaceFolders[0].uri
    );
    settings.shouldWriteDebug = workspaceConfig.get("debug");
    settings.debugLogPath = workspaceConfig.get("debugLogPath");
    settings.featuresEnabled.frameworks = workspaceConfig.get("features.enableFrameworks");
    settings.featuresEnabled.hosting = workspaceConfig.get("features.enableHosting");
    settings.featuresEnabled.emulators = workspaceConfig.get("features.enableEmulators");
    settings.featuresEnabled.quickstart = workspaceConfig.get("features.enableQuickstart");
    settings.npmPath = workspaceConfig.get("npmPath");
    if (settings.npmPath) {
      process.env.PATH += `:${settings.npmPath}`;
    }
  }
  return settings;
}