import { browser, expect } from "@wdio/globals";
import {
  ExecutionPanel,
  HistoryItem,
} from "../../utils/page_objects/execution";
import { firebaseSuite, firebaseTest } from "../../utils/test_hooks";
import { EditorView } from "../../utils/page_objects/editor";
import {
  mockProject,
  mutationsPath,
  queriesPath,
  queryWithFragmentPath,
} from "../../utils/projects";
import { FirebaseCommands } from "../../utils/page_objects/commands";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { mockUser } from "../../utils/user";
import { Workbench, Notification } from "wdio-vscode-service";
import { Notifications } from "../../utils/page_objects/notifications";

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
      const startEmulatorsNotif =
        await notificationUtil.getStartEmulatorNotification();
      expect(startEmulatorsNotif).toExist();

      console.log(
        "Starting emulators from local execution. Waiting for emulators to start...",
      );

      await commands.waitForEmulators();

      const current = await sidebar.currentEmulators();
      expect(current).toContain("dataconnect :9399");
      await browser.pause(4000); // strange case where emulators are showing before actually callable

      // Test 1 - Execute mutation
      console.log(`Running test: executing a mutation`);

      // Update arguments
      await execution.open();
      await execution.setVariables(`{"id": "42", "content": "Hello, World!"}`);

      // Insert a post
      await editor.openFile(mutationsPath);

      await editor.runLocalButton.waitForDisplayed();
      await editor.runLocalButton.click();

      async function getExecutionStatus(name: string) {
        await browser.pause(1000);
        let item = await execution.history.getSelectedItem();
        let status = await item.getStatus();
        let label = await item.getLabel();
        while (status === "pending" && label !== name) {
          await browser.pause(1000);
          item = await execution.history.getSelectedItem();
          status = await item.getStatus();
        }

        return item;
      }

      // Waiting for the execution to finish
      let result = await getExecutionStatus("createPost");
      expect(await result.getLabel()).toBe("createPost");

      // Test 2 - Execute mutation
      console.log("Running test: executing a query");

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

      // Test 3: Execute operation with fragment

      console.log(`Running test: executing an operation with a fragment`);

      await execution.setVariables(`{}`);
      await editor.openFile(queryWithFragmentPath);
      await editor.runLocalButton.waitForDisplayed();
      await editor.runLocalButton.click();

      // Waiting for the new history entry to appear
      await browser.waitUntil(async () => {
        const selectedItem = await execution.history.getSelectedItem();
        return (await selectedItem.getLabel()) === "fragmentTest";
      });

      // Check the history entry
      const item3 = await getExecutionStatus("fragmentTest");
      expect(await item3.getLabel()).toBe("fragmentTest");
      expect(await item3.getStatus()).toBe("success");
    },
  );
});
