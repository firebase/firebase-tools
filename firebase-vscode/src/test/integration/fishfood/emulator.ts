import { firebaseSuite, firebaseTest } from "../../utils/test_hooks";
import { FirebaseCommands } from "../../utils/page_objects/commands";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";

import { TerminalView } from "../../utils/page_objects/terminal";
import { Notifications } from "../../utils/page_objects/notifications";
import { mockUser } from "../../utils/user";
import { mockProject } from "../../utils/projects";

firebaseSuite("Emulators", async function () {
  firebaseTest(
    "Clicking on `Start emulators` reflects the task state in the sidebar",
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

      await sidebar.clearEmulatorData();
      const text = await terminal.getTerminalText();
      expect(text.includes("Clearing data from Data Connect data sources")).toBeTruthy();

      await sidebar.exportEmulatorData();
      const exportNotification = await notifications.getExportNotification();
      expect(exportNotification).toExist();

    },
  );
});
