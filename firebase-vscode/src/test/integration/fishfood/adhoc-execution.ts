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
import path from "path";

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

      // Test 1 - Execute adhoc read data

      // Open the schema file
      const schemaFilePath = path.join(
        __dirname,
        "..",
        "..",
        "test_projects",
        "fishfood",
        "dataconnect",
        "schema",
        "schema.gql",
      );
      await editor.openFile(schemaFilePath);

      // Verify that inline Read Data button is displayed
      const readDataButton = await editor.readDataButton;
      await readDataButton.waitForDisplayed();

      // Click the Read Data button
      await readDataButton.click();

      // Wait a bit for the query to be generated
      await browser.pause(5000);

      // Verify the generated query
      const activeEditor = await editor.getActiveEditor();
      const editorTitle = activeEditor?.document.fileName.split("/").pop();
      const editorContent = await editor.activeEditorContent();

      expect(editorContent).toHaveText(`query {
  posts{
    id
    content
  }
}`);
      // file should be created, saved, then opened
      expect(activeEditor?.document.isDirty).toBe(false);

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

      // Check the history entry
      const item3 = await getExecutionStatus("anonymous");
      expect(await item3.getLabel()).toBe("anonymous");
      expect(await item3.getStatus()).toBe("success");
      await editor.closeAllEditors();
    },
  );
});
