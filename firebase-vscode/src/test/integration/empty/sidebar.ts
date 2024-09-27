import { browser } from "@wdio/globals";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { firebaseTest } from "../../utils/test_hooks";

firebaseTest("Supports opening empty projects", async function () {
  it("opens an empty project", async function () {
    const workbench = await browser.getWorkbench();

    const sidebar = new FirebaseSidebar(workbench);

    await sidebar.openExtensionSidebar();
    await workbench.wait(5000);

    await sidebar.runInStudioContext(async (firebase) => {
      await firebase.signInWithGoogleLink.waitForDisplayed();
    });
  });
});
