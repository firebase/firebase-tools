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
import { Workbench, Notification } from "wdio-vscode-service";
import {Notifications} from "../../utils/page_objects/notifications"

firebaseSuite("Execution", async function () {
  firebaseTest(
    "should be able to start emulator and execute operation",
    async function () {
      const workbench = await browser.getWorkbench();

      const sidebar = new FirebaseSidebar(workbench);
      await sidebar.openExtensionSidebar();

      const commands = new FirebaseCommands();
      await commands.waitForUser();

      await mockUser({ email: "test@gmail.com" });
      await mockProject("test-project");

      const execution = new ExecutionPanel(workbench);
      const editor = new EditorView(workbench);

      // Click run local while emulator is not started
      await editor.openFile(mutationsPath);
      await editor.runLocalButton.waitForDisplayed();
      await editor.runLocalButton.click();


      // get start emulator notification
      const notificationUtil = new Notifications(workbench);      
      const startEmulatorsNotif = await notificationUtil.getStartEmulatorNotification();
      expect(startEmulatorsNotif).toExist();
      // should always exist due to check above; Click Yes
      if (startEmulatorsNotif) 
        notificationUtil.startEmulatorFromNotification(startEmulatorsNotif);

      console.log(
        "Starting emulators from local execution. Waiting for emulators to start...",
      );

      await commands.waitForEmulators();
      const current = await sidebar.currentEmulators();
      expect(current).toContain("dataconnect :9399");

      // Test 2 - Execute queries

      // Update arguments
      await execution.open();
      await execution.setVariables(`{"id": "42", "content": "Hello, World!"}`);

      // Insert a post
      await editor.openFile(mutationsPath);
      await editor.runLocalButton.waitForDisplayed();
      await editor.runLocalButton.click();

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
      expect(await item2.getDescription()).toHaveText(
        'Arguments: {"id": "42"}',
      );
    },
  );
});
