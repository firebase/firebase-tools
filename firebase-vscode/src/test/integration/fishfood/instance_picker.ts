import { browser } from "@wdio/globals";
import { StatusBar, findQuickPicks } from "../../utils/page_objects/status_bar";
import { firematTest } from "../../utils/test_hooks";
import { EditorView } from "../../utils/page_objects/editor";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { queriesPath } from "../../utils/projects";

firematTest("Can pick an instance", async function () {
  const workbench = await browser.getWorkbench();
  const statusBar = new StatusBar(workbench);
  const editor = new EditorView(workbench);
  const sidebar = new FirebaseSidebar(workbench);

  await sidebar.startEmulators();
  await editor.openFile(queriesPath);

  // Check default value
  expect(await statusBar.currentInstanceElement.getText()).toBe("emulator");

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
    async () =>
      (await editor.firstCodeLense.getText()) === "Run (wonderland2)",
  );
});
