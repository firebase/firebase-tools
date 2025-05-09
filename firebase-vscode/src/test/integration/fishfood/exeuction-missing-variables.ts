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

    const notification = new Notifications(workbench);

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
    
    const editVariablesNotif = await notification.getEditVariablesNotification();

    if (!editVariablesNotif) {
      throw(new Error("Edit Variables Notification not found"));
    }
    await notification.editVariablesFromNotification(editVariablesNotif);

    expect(await execution.getVariables()).toEqual(`{"id":"42","content":""}`);

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
  });
});
