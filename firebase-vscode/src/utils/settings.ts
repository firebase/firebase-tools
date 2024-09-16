import { workspace } from "./test_hooks";

interface Settings {
  readonly shouldWriteDebug: boolean;
  readonly debugLogPath: string;
  readonly useFrameworks: boolean;
  readonly npmPath: string;
  readonly firebasePath: string;
}

export function getSettings(): Settings {
  const config = workspace.value.getConfiguration(
    "firebase",
    workspace.value.workspaceFolders[0].uri,
  );

  return {
    debugLogPath: config.get<string>("debugLogPath"),
    firebasePath: config.get<string>("firebasePath"),
    npmPath: config.get<string>("npmPath"),
    shouldWriteDebug: config.get<boolean>("debug"),
    useFrameworks: config.get<boolean>("hosting.useFrameworks"),
  };
}
