import { firebaseSuite, firebaseTest } from "../../utils/test_hooks";
import { FirebaseCommands } from "../../utils/page_objects/commands";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";

import { TerminalView } from "../../utils/page_objects/terminal";
import { Notifications } from "../../utils/page_objects/notifications";
import { mockUser } from "../../utils/user";
import { mockProject, schemaPath } from "../../utils/projects";
import { EditorView } from "../../utils/page_objects/editor";

firebaseSuite("Emulator", async function () {
  firebaseTest(
    "Data connect emulator has export, clear, and connect to stream",
    async function () {
      const workbench = await browser.getWorkbench();
      const sidebar = new FirebaseSidebar(workbench);
      const commands = new FirebaseCommands();
      const terminal = new TerminalView(workbench);
      const notifications = new Notifications(workbench);

      await sidebar.openExtensionSidebar();
      await commands.waitForUser();

      await mockUser({ email: "test@gmail.com" });
      await mockProject("test-project");
      await sidebar.startEmulators();
      console.log("Waiting for emulators to start...");
      await commands.waitForEmulators();
      const current = await sidebar.currentEmulators();

      expect(current).toContain("dataconnect :9399");

      // Test 1: clear data button
      await sidebar.clearEmulatorData();
      const text = await terminal.getTerminalText();
      expect(
        text.includes("Clearing data from Data Connect data sources"),
      ).toBeTruthy();

      // Test 2: export data button
      await sidebar.exportEmulatorData();
      const exportNotification = await notifications.getExportNotification();
      expect(exportNotification).toExist();

      // Test 3: edit the schema to cause a migration error
      const editor = new EditorView(workbench);
      await editor.openFile(schemaPath);

      browser.executeWorkbench((vscode) => {
        // necessary to get vscode type
        editor.getActiveEditor().then((activeEditor) => {
          activeEditor?.edit((editBuilder) => {
            // replace String w/ Int
            editBuilder.replace(
              new vscode.Range(
                new vscode.Position(8, 12),
                new vscode.Position(8, 18),
              ),
              "Int",
            );
          });
        });
      });

      // look for a notification w/ sql_migration error
      expect(
        (await workbench.getNotifications()).find(async (notification) => {
          const message = await notification.getMessage();
          return message.includes("Data Connect Emulator: SQL_MIGRATION");
        }),
      ).toBeTruthy();
    },
  );
});
