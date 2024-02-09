import { browser } from "@wdio/globals";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { ExecutionPanel } from "../../utils/page_objects/execution";
import { firematTest } from "../../utils/test_hooks";
import { EditorView } from "../../utils/page_objects/editor";
import { queriesPath } from "../../utils/projects";

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
