import { firebaseTest } from "../../utils/test_hooks";
import { FirebaseCommands } from "../../utils/page_objects/commands";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { mockUser } from "../../utils/user";

firebaseTest("Emulators", async function () {
  it("Clicking on `Start emulators` reflects the task state in the sidebar", async function () {
    const workbench = await browser.getWorkbench();
    await mockUser({ email: "test@gmail.com" });

    const sidebar = new FirebaseSidebar(workbench);

    await sidebar.startEmulators();

    const commands = new FirebaseCommands();
    await commands.waitForEmulators();

    const current = await sidebar.currentEmulators();

    expect(current).toContain("dataconnect :9399");
  });
});
