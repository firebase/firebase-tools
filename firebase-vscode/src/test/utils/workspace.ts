import path from "path";
import { workspace } from "../../utils/test_hooks";
import { createFile, createTemporaryDirectory } from "./fs";
import { createFake, mock } from "./mock";
import * as vscode from "vscode";

export type TestWorkspaceConfig = {
  debugLabel?: string;
  firebaseRc?: unknown;
  firebaseConfig?: unknown;
  files?: Record<string, string>;
};

export interface TestWorkspace {
  debugName?: string;
  path: string;
  firebaseRCPath: string;
  firebaseConfigPath: string;
}

export interface TestWorkspaces {
  byName(name: string): TestWorkspace | undefined;
  byIndex(index: number): TestWorkspace | undefined;
}

/* Sets up a mock workspace with the given files and firebase config. */
export function setupMockTestWorkspaces(
  ...workspaces: TestWorkspaceConfig[]
): TestWorkspaces {
  const workspaceFolders = workspaces.map<TestWorkspace>((workspace) => {
    const dir = createTemporaryDirectory({
      debugLabel: workspace.debugLabel,
    });

    const firebaseRCPath = path.join(dir, ".firebaserc");
    const firebaseConfigPath = path.join(dir, "firebase.json");

    if (workspace.firebaseRc) {
      createFile(firebaseRCPath, JSON.stringify(workspace.firebaseRc));
    }
    if (workspace.firebaseConfig) {
      createFile(firebaseConfigPath, JSON.stringify(workspace.firebaseConfig));
    }

    if (workspace.files) {
      for (const [filename, content] of Object.entries(workspace.files)) {
        createFile(dir, filename, content);
      }
    }

    return {
      path: dir,
      firebaseRCPath,
      firebaseConfigPath,
    };
  });

  mock(workspace, {
    workspaceFolders: workspaceFolders.map((workspace) =>
      createFake<vscode.WorkspaceFolder>({
        uri: vscode.Uri.file(workspace.path),
      })
    ),
    createFileSystemWatcher: (...args) => {
      // We don't mock watchers, so we defer to the real implementation.
      return vscode.workspace.createFileSystemWatcher(...args);
    },
  });

  return {
    byName(name: string) {
      return workspaceFolders.find((wf) => wf.debugName === name);
    },
    byIndex(index: number) {
      return workspaceFolders[index];
    },
  };
}
