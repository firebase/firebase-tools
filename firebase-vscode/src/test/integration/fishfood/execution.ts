import { browser } from "@wdio/globals";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { ExecutionPanel } from "../../utils/page_objects/execution";
import { addTearDown, firebaseTest } from "../../utils/test_hooks";
import { EditorView } from "../../utils/page_objects/editor";
import { queriesPath } from "../../utils/projects";
import { FirebaseCommands } from "../../utils/page_objects/commands";

firebaseTest("Can execute queries", async function () {
  const workbench = await browser.getWorkbench();
  const sidebar = new FirebaseSidebar(workbench);
  const execution = new ExecutionPanel(workbench);
  const editor = new EditorView(workbench);
  const commands = new FirebaseCommands();

  await sidebar.startEmulators();
  addTearDown(() => commands.stopEmulators());

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

  // TODO this should work without opening the sidebar
  // While the emulator correctly starts without, some leftover state
  // still needs the sidebar.
  expect(await item.getLabel()).toBe("getPost");

  // Waiting for the execution to finish
  browser.waitUntil(async () => {
    (await item.getStatus()) === "success";
  });

  expect(await item.getDescription()).toContain('Arguments: { "id": "42" }');
});
