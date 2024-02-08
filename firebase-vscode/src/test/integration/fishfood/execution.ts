import { browser } from "@wdio/globals";
import { FirebaseSidebar } from "../../utils/sidebar";
import * as vscode from "vscode";
import * as path from "path";
import { ExecutionPanel } from "../../utils/execution";
import { firematTest } from "../../utils/test_hooks";
import { EditorView } from "../../utils/editor";

export const mutationsPath = path.resolve(
  process.cwd(),
  "src/test/test_projects/fishfood/api/operations/mutations.gql",
);

export const queriesPath = path.resolve(
  process.cwd(),
  "src/test/test_projects/fishfood/api/operations/queries.gql",
);

firematTest("Can execute queries", async function () {
  const workbench = await browser.getWorkbench();
  const sidebar = new FirebaseSidebar(workbench);
  const execution = new ExecutionPanel(workbench);
  const editor = new EditorView(workbench);

  await sidebar.startEmulators();

  // Update arguments
  await execution.open();

  await execution.setVariables(`{
  "id": "42"
}`);

  // Execute query
  await editor.openFile(queriesPath);

  await editor.firstCodeLense.waitForDisplayed();
  await editor.firstCodeLense.click();

  // Check the history entry
  // TODO - revert history and result view after test
  const item = await execution.history.getSelectedItem();

  expect(await item.getLabel()).toBe("getPost");
  expect(await item.getStatus()).toBe("success");
  expect(await item.getDescription()).toContain('Arguments: { "id": "42" }');
});
