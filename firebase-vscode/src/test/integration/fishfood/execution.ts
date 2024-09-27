import { browser, expect } from "@wdio/globals";
import { ExecutionPanel } from "../../utils/page_objects/execution";
import { firebaseTest } from "../../utils/test_hooks";
import { EditorView } from "../../utils/page_objects/editor";
import { mutationsPath, queriesPath } from "../../utils/projects";
import { FirebaseCommands } from "../../utils/page_objects/commands";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { mockUser } from "../../utils/user";

firebaseTest("Execution", async function () {
  it("should execute a query", async function () {
    const workbench = await browser.getWorkbench();
    await mockUser({ email: "test@gmail.com" });

    const sidebar = new FirebaseSidebar(workbench);
    const execution = new ExecutionPanel(workbench);
    const editor = new EditorView(workbench);
    const commands = new FirebaseCommands();

    await sidebar.startEmulators();
    await commands.waitForEmulators();

    // Update arguments
    await execution.open();
    await execution.setVariables(`{"id": "42", "content": "Hello, World!"}`);

    // Insert a post
    await editor.openFile(mutationsPath);
    await editor.runLocalButton.waitForDisplayed();
    await editor.runLocalButton.click();

    // Check the history entry
    const item1 = await execution.history.getSelectedItem();

    // Waiting for the execution to finish
    await browser.waitUntil(async () => {
      const status = await item1.getStatus();
      return status === "success";
    });

    expect(await item1.getLabel()).toBe("createPost");

    await execution.setVariables(`{"id": "42"}`);

    // Execute query
    await editor.openFile(queriesPath);
    await editor.runLocalButton.waitForDisplayed();
    await editor.runLocalButton.click();

    // Waiting for the new history entry to appear
    await browser.waitUntil(async () => {
      const selectedItem = await execution.history.getSelectedItem();
      return (await selectedItem.getLabel()) === "getPost";
    });

    // Check the history entry
    const item2 = await execution.history.getSelectedItem();

    // Waiting for the execution to finish
    await browser.waitUntil(async () => {
      const status = await item2.getStatus();
      return status === "success";
    });

    expect(await item2.getLabel()).toBe("getPost");
    expect(await item2.getDescription()).toHaveText('Arguments: {"id": "42"}');
  });
});
