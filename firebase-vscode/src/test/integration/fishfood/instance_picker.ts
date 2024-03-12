import { browser } from "@wdio/globals";
import { StatusBar, findQuickPicks } from "../../utils/page_objects/status_bar";
import { addTearDown, dataConnectTest } from "../../utils/test_hooks";
import { EditorView } from "../../utils/page_objects/editor";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { queriesPath } from "../../utils/projects";
import { FirebaseCommands } from "../../utils/page_objects/commands";

dataConnectTest(
  "If the emulator is not started, picking the emulator auto-starts it",
  async function () {
    const workbench = await browser.getWorkbench();
    const commands = new FirebaseCommands();
    const statusBar = new StatusBar(workbench);
    const editor = new EditorView(workbench);

    // Ensure following tests are in a clean state
    addTearDown(async () => {
      await commands.stopEmulators();
      const center = await workbench.openNotificationsCenter();
      await center.clearAllNotifications();
    });

    await editor.openFile(queriesPath);

    await statusBar.currentInstanceElement.click();

    const picks = await findQuickPicks();
    const pickTexts = await picks.mapSeries((p) => p.getText());

    expect(pickTexts).toEqual([
      " Start Emulators",
      "asia-east1",
      "europe-north1",
      "wonderland2",
    ]);

    await picks[0].click();

    // Should show a "emulators started" notification
    await browser.waitUntil(async () => {
      const notification = await workbench.getNotifications();

      for (const n of notification) {
        const text = await n.elem.getText();
        if (text === "Firebase Extension: Emulators started successfully") {
          return true;
        }
      }

      return false;
    });
  },
);

dataConnectTest("Can pick an instance", async function () {
  const workbench = await browser.getWorkbench();
  const commands = new FirebaseCommands();
  const statusBar = new StatusBar(workbench);
  const editor = new EditorView(workbench);

  await commands.startEmulators();

  await editor.openFile(queriesPath);

  // Check default value
  expect(await statusBar.currentInstanceElement.getText()).toBe(" emulator");

  // Verify that the code-lenses reflect the selected instance
  await editor.firstCodeLense.waitForDisplayed();
  expect(await editor.firstCodeLense.getText()).toBe("Run (emulator)");

  await statusBar.currentInstanceElement.click();

  const picks = await findQuickPicks();
  const pickTexts = await picks.mapSeries((p) => p.getText());

  expect(pickTexts).toEqual([
    "Emulator",
    "asia-east1",
    "europe-north1",
    "wonderland2",
  ]);

  await picks[3].click();

  // The code-lenses and statusbar should update
  statusBar.currentInstanceElement.waitUntil(
    async () =>
      (await statusBar.currentInstanceElement.getText()) === "wonderland2",
  );
  statusBar.currentInstanceElement.waitUntil(
    async () => (await editor.firstCodeLense.getText()) === "Run (wonderland2)",
  );
});
