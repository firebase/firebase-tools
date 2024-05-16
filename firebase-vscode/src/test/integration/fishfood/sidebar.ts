import { browser } from "@wdio/globals";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { firebaseTest } from "../../utils/test_hooks";
import { FirebaseCommands } from "../../utils/page_objects/commands";

firebaseTest(
  "If emulators are started before opening the sidebar, get a clean initial state",
  async function () {
    const workbench = await browser.getWorkbench();
    const commands = new FirebaseCommands();
    const sidebar = new FirebaseSidebar(workbench);

    await commands.startEmulators();

    await sidebar.open();
    await sidebar.runInFirebaseViewContext(async (firebase) => {
      await sidebar.stopEmulatorBtn.waitForDisplayed();
    });
  }
);
