import { ConfigurationTarget, workspace } from "vscode";
import { DATA_CONNECT_EVENT_NAME, AnalyticsLogger } from "../analytics";

export interface Settings {
  readonly firebasePath: string;
  readonly firebaseBinaryKind: string;
  readonly npmPath: string;
  readonly useFrameworks: boolean;
  readonly shouldShowIdxMetricNotice: boolean;
  readonly importPath?: string;
  readonly exportPath: string;
  readonly exportOnExit: boolean;
  readonly debug: boolean;
  readonly extraEnv: Record<string, string>;
}

// TODO: Temporary fallback for bashing, this should probably point to the global firebase binary on the system
const DEFAULT_FIREBASE_BINARY = "npx -y firebase-tools@latest";

export function getSettings(): Settings {
  const config = workspace.getConfiguration("firebase");
  const firebasePath =
    config.get<string>("firebasePath") || DEFAULT_FIREBASE_BINARY;

  let firebaseBinaryKind = "unknown"; // Used for analytics.
  if (firebasePath === DEFAULT_FIREBASE_BINARY) {
    firebaseBinaryKind = "npx";
  } else if (firebasePath.endsWith("/.local/bin/firebase")) {
    // https://firebase.tools/dataconnect defaults to $HOME/.local/bin
    firebaseBinaryKind = "firepit-local";
  } else if (firebasePath.endsWith("/local/bin/firebase")) {
    // https://firebase.tools/ defaults to /usr/local/bin
    firebaseBinaryKind = "firepit-global";
  }

  const extraEnv = config.get<Record<string,string>>("extraEnv", {})
  process.env = { ...process.env, ...extraEnv };
  
  return {
    firebasePath,
    firebaseBinaryKind,
    npmPath: config.get<string>("npmPath", "npm"),
    useFrameworks: config.get<boolean>("hosting.useFrameworks", false),
    shouldShowIdxMetricNotice: config.get<boolean>(
      "idx.viewMetricNotice",
      true,
    ),
    importPath: config.get<string>("emulators.importPath"),
    exportPath: config.get<string>("emulators.exportPath", "./exportedData"),
    exportOnExit: config.get<boolean>("emulators.exportOnExit", false),
    debug: config.get<boolean>("debug", false),
    extraEnv,
  };
}

export function updateIdxSetting(shouldShow: boolean) {
  const config = workspace.getConfiguration("firebase");
  config.update("idx.viewMetricNotice", shouldShow, ConfigurationTarget.Global);
}

// Persist env var as path setting when path setting doesn't exist
export function setupFirebasePath(analyticsLogger: AnalyticsLogger) {
  const config = workspace.getConfiguration("firebase");
  if (process.env.FIREBASE_BINARY && !config.get<string>("firebasePath")) {
    config.update(
      "firebasePath",
      process.env.FIREBASE_BINARY,
      ConfigurationTarget.Global,
    );
  }
  analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.SETUP_FIREBASE_BINARY);
}
