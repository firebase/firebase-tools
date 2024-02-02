import { browser } from "@wdio/globals";
import { openFirebaseSidebar } from "../utils/sidebar";

describe("Select project command", () => {
  it("waits until projects are loaded", async function () {
    const workbench = await browser.getWorkbench();

    // This shouldn't be necessary. But at the moment,
    // users aren't loaded until the sidebar is opened –
    // which blocks the loading of projects.
    openFirebaseSidebar();

    const picker = await workbench.executeCommand("firebase.selectProject");

    // Wait until at least one option is offered in the picker
    // This would timeout if the picker didn't wait for projects to be loaded.
    await picker.progress$.waitUntil(
      async () => (await picker.getQuickPicks()).length !== 0
    );
  });
});
