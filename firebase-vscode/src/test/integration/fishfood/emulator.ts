import { firebaseTest } from "../../utils/test_hooks";
import { FirebaseCommands } from "../../utils/page_objects/commands";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";

firebaseTest("Emulators", async function () {
  it("Clicking on `Start emulators` reflects the task state in the status bar", async function () {
    const workbench = await browser.getWorkbench();

    const sidebar = new FirebaseSidebar(workbench);
    await sidebar.startEmulators();

    const commands = new FirebaseCommands();
    await commands.waitForEmulators();

    const current = await sidebar.currentEmulators();

    expect(current).toContain("dataconnect :9399");
  });
});
