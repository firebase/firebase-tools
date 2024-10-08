import { ConfigurationTarget, workspace } from "vscode";

export interface Settings {
  readonly firebasePath: string;
  readonly npmPath: string;
  readonly useFrameworks: boolean;
  readonly shouldShowIdxMetricNotice: boolean;
}

const FIREBASE_BINARY =
  // Allow defaults via env var. Useful when starting VS Code from command line or Monospace.
  process.env.FIREBASE_BINARY ||
  // TODO: Temporary fallback for bashing, this should probably point to the global firebase binary on the system
  "npx -y firebase-tools@latest";

export function getSettings(): Settings {
  const config = workspace.getConfiguration("firebase");

  return {
    firebasePath: config.get<string>("firebasePath") || FIREBASE_BINARY,
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
