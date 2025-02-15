import { browser, expect } from "@wdio/globals";
import {
  ExecutionPanel,
  HistoryItem,
} from "../../utils/page_objects/execution";
import { firebaseSuite, firebaseTest } from "../../utils/test_hooks";
import { EditorView } from "../../utils/page_objects/editor";
import { mockProject, mutationsPath, queriesPath } from "../../utils/projects";
import { FirebaseCommands } from "../../utils/page_objects/commands";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { mockUser } from "../../utils/user";
import { Notifications } from "../../utils/page_objects/notifications";

firebaseSuite("Execution", async function () {
  firebaseTest("should ask user to add missing variables", async function () {
    const workbench = await browser.getWorkbench();

    const sidebar = new FirebaseSidebar(workbench);
    await sidebar.openExtensionSidebar();

    const commands = new FirebaseCommands();
    await commands.waitForUser();

    const notication = new Notifications(workbench);

    await mockUser({ email: "test@gmail.com" });
    await mockProject("test-project");

    const execution = new ExecutionPanel(workbench);
    const editor = new EditorView(workbench);

    await sidebar.startEmulators();
    await commands.waitForEmulators();

    // Update arguments
    await execution.open();
    await execution.setVariables(`{"id": "42"}`);

    // Insert a post
    await editor.openFile(mutationsPath);
    await editor.runLocalButton.waitForDisplayed();
    await editor.runLocalButton.click();

    const editVariablesNotif = await notication.getEditVariablesNotification();
    console.log("HAROLD:: ", await editVariablesNotif?.getActions())
    editVariablesNotif?.takeAction("Edit Variables");


    expect(await execution.getVariables()).toEqual(`{"id": "42", "content": ""}`);

    // click re-run button to continue
    await execution.clickRerun();

    async function getExecutionStatus() {
      let item = await execution.history.getSelectedItem();
      let status = await item.getStatus();
      while (status === "pending") {
        await browser.pause(1000);
        item = await execution.history.getSelectedItem();
        status = await item.getStatus();
      }

      return item;
    }

    // Waiting for the execution to finish
    let result = await getExecutionStatus();

    expect(await result.getLabel()).toBe("createPost");

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
