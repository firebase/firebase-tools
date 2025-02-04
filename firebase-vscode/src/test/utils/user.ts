import { User } from "../../types/auth";
import * as vscode from "vscode";

export async function mockUser(user: User | undefined): Promise<void> {
  return browser.executeWorkbench<void>(
    async (vs: typeof vscode, user: User) => {
      const promise = vs.commands.executeCommand("fdc-graphql.mock.user", user);
      return promise;
    },
    user,
  );
}
