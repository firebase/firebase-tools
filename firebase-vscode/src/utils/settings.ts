import { workspace } from "./test_hooks";

export interface Settings {
  readonly debugLogPath: string;
  readonly firebasePath: string;
  readonly npmPath: string;
  readonly shouldWriteDebug: boolean;
  readonly useFrameworks: boolean;
}

const FIREBASE_BINARY =
  // Allow defaults via env var. Useful when starting VS Code from command line or Monospace.
  process.env.FIREBASE_BINARY ||
  // Temporary fallback for bashing, this should probably point to the global firebase binary on the system
  "npx -y firebase/firebase-tools#launch.fdc-pp";

export function getSettings(): Settings {
  const config = workspace.value.getConfiguration("firebase");

  return {
    debugLogPath: config.get<string>("debugLogPath", "/tmp/firebase-debug.log"),
    firebasePath: config.get<string>("firebasePath") || FIREBASE_BINARY,
    npmPath: config.get<string>("npmPath", "npm"),
    shouldWriteDebug: config.get<boolean>("debug", true),
    useFrameworks: config.get<boolean>("hosting.useFrameworks", false),
  };
}
