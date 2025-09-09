import { browser, expect } from "@wdio/globals";
import { firebaseSuite, firebaseTest } from "../../utils/test_hooks";
import { FirebaseCommands } from "../../utils/page_objects/commands";
import { Workbench, Notification } from "wdio-vscode-service";
import { Notifications } from "../../utils/page_objects/notifications";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";

firebaseSuite("Gemini Install", async function () {
  firebaseTest(
    "should prompt to install Gemini and open chat view",
    async function () {
      const workbench = await browser.getWorkbench();

      const sidebar = new FirebaseSidebar(workbench);
      await sidebar.openExtensionSidebar();

      await sidebar.runInStudioContext(async (studio) => {
        await studio.geminiButton.waitForDisplayed();
        await studio.geminiButton.click();
      });

      const notificationUtil = new Notifications(workbench);
      const installNotification =
        await notificationUtil.getGeminiInstallNotification();
      expect(installNotification).toExist();

      // Click "Yes"
      await notificationUtil.clickYesFromGeminiInstallNotification(
        installNotification!, // verified in expect statement above,
      );

      // Verify that the Gemini chat view is focused
      const chatView = await workbench.getEditorView().webView$;
      await chatView.waitForExist({ timeout: 50000 });
      const chatViewTitle = await chatView.getTitle();
      expect(chatViewTitle).toBe(
        "[Extension Development Host] Gemini Code Assist - Welcome — fishfood",
      );

      await browser.executeWorkbench((vscode) => {
        vscode.commands.executeCommand(
          "workbench.extensions.uninstallExtension",
          "google.geminicodeassist",
        );
      });
    },
  );
});
