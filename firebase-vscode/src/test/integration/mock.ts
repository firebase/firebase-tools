import { addTearDown } from "../utils/test_hooks";
import { deploy as cliDeploy } from "../../../../src/deploy";
import * as vscode from "vscode";

export async function e2eSpy(key: string): Promise<void> {
  addTearDown(async () => {
    await callBrowserSpyCommand(key, { spy: false });
  });

  await callBrowserSpyCommand(key, { spy: true });
}

export function getE2eSpyCalls(
  key: "deploy"
): Promise<Array<Parameters<typeof cliDeploy>>>;
export async function getE2eSpyCalls(key: string): Promise<Array<Array<any>>> {
  return callBrowserSpyCommand(
    key,
    // We don't mock anything, just read the call list.
    { spy: undefined }
  );
}

async function callBrowserSpyCommand(
  key: string,
  args: { spy: boolean | undefined }
): Promise<Array<Array<any>>> {
  const result = await browser.executeWorkbench(
    (vs: typeof vscode, key, args) => {
      return vs.commands.executeCommand(key, args);
    },
    `fdc-graphql.spy.${key}`,
    args
  );

  return result as Array<Array<any>>;
}
