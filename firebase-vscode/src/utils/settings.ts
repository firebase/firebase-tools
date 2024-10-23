import { ConfigurationTarget, window, workspace } from "vscode";

export interface Settings {
  readonly firebasePath: string;
  readonly npmPath: string;
  readonly useFrameworks: boolean;
  readonly shouldShowIdxMetricNotice: boolean;
}

// TODO: Temporary fallback for bashing, this should probably point to the global firebase binary on the system
const DEFAULT_FIREBASE_BINARY = "npx -y firebase-tools@latest";

export function getSettings(): Settings {
  const config = workspace.getConfiguration("firebase");

  // TODO: Consider moving side effect out of getSettings
  // Persist env var as path setting when path setting doesn't exist
  if (process.env.FIREBASE_BINARY && !config.get<string>("firebasePath")) {
    config.update(
      "firebasePath",
      process.env.FIREBASE_BINARY,
      ConfigurationTarget.Global,
    );
    window.showInformationMessage(
      "Detected FIREBASE_BINARY env var. Saving to `Firebase Path` setting.",
    );
  }

  return {
    firebasePath: config.get<string>("firebasePath") || DEFAULT_FIREBASE_BINARY,
    npmPath: config.get<string>("npmPath", "npm"),
    useFrameworks: config.get<boolean>("hosting.useFrameworks", false),
    shouldShowIdxMetricNotice: config.get<boolean>(
      "idx.viewMetricNotice",
      true,
    ),
  };
}

export function updateIdxSetting(shouldShow: boolean) {
  const config = workspace.getConfiguration("firebase");
  config.update("idx.viewMetricNotice", shouldShow, ConfigurationTarget.Global);
}
