import { User } from "../../types/auth";
import * as vscode from "vscode";

export async function mockUser(user: User) {
  return browser.executeWorkbench(async (vs: typeof vscode, user: User) => {
    const promise = vs.commands.executeCommand("fdc-graphql.mock.user", user);
    return promise;
  }, user);
}
