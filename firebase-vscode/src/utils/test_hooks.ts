import * as vscode from "vscode";

/// A value wrapper for mocking purposes.
export type Ref<T> = { value: T };

export type Workspace = typeof vscode.workspace;
export const workspace: Ref<Workspace> = { value: vscode.workspace };

export interface Mockable<T extends (...args: any) => any> {
  call: (...args: Parameters<T>) => ReturnType<T>;

  dispose(): void;
}

export function createE2eMockable<T extends (...args: any) => any>(
  cb: T,
  key: string,
  fallback: () => ReturnType<T>,
): Mockable<T> {
  let value: (...args: Parameters<T>) => ReturnType<T> = cb;
  const calls: Parameters<T>[] = [];

  // A command used by e2e tests to replace the `deploy` function with a mock.
  // It is not part of the public API.
  const command = vscode.commands.registerCommand(
    `fdc-graphql.spy.${key}`,
    (options?: { spy?: boolean }) => {
      // Explicitly checking true/false to not update the value if `undefined`.
      if (options?.spy === false) {
        value = cb;
      } else if (options?.spy === true) {
        value = fallback;
      }

      return calls;
    },
  );

  return {
    call: (...args: Parameters<T>) => {
      calls.push(args);

      return value(...args);
    },
    dispose: command.dispose,
  };
}
