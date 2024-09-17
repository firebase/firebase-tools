import { workspace } from "./test_hooks";

interface Settings {
  readonly shouldWriteDebug: boolean;
  debugLogPath: string;
  useFrameworks: boolean;
  npmPath: string;
}

export function getSettings(): Settings {
  // Get user-defined VSCode settings if workspace is found.
  if (workspace.value.workspaceFolders) {
    const workspaceConfig = workspace.value.getConfiguration(
      "firebase",
      workspace.value.workspaceFolders[0].uri
    );

    return {
      shouldWriteDebug: workspaceConfig.get("debug"),
      debugLogPath: workspaceConfig.get("debugLogPath"),
      useFrameworks: workspaceConfig.get("useFrameworks"),
      npmPath: workspaceConfig.get("npmPath"),
    };
  }

  return {
    shouldWriteDebug: false,
    debugLogPath: "",
    useFrameworks: false,
    npmPath: "",
  };
}
