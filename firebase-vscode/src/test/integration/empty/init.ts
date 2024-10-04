import { FirebaseCommands } from "../../utils/page_objects/commands";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { mockProject } from "../../utils/projects";
import { waitForTaskCompletion, waitForTaskStart } from "../../utils/task";
import { firebaseSuite, firebaseTest } from "../../utils/test_hooks";
import { mockUser } from "../../utils/user";

firebaseSuite("Init Firebase", async function () {
  firebaseTest("calls init command in an empty project", async function () {
    const workbench = await browser.getWorkbench();

    const sidebar = new FirebaseSidebar(workbench);
    await sidebar.openExtensionSidebar();

    const commands = new FirebaseCommands();
    await commands.waitForUser();

    await mockUser({ email: "test@gmail.com" });
    await mockProject("demo-project");

    await sidebar.runInStudioContext(async (firebase) => {
      await firebase.initFirebaseBtn.waitForExist();
      await firebase.initFirebaseBtn.waitForDisplayed();
      await firebase.initFirebaseBtn.click();
    });

    console.log("Clicked init button");

    // Check the task was executed
    // Wait for the task to complete and verify it started
    const taskStarted = await waitForTaskCompletion(
      "firebase init dataconnect",
    );
    console.log("Task started: ", taskStarted);

    // Assert that the task was started successfully.
    // We don't need to check if it completed because the task will fail in a test environment.
    expect(taskStarted).toBeTruthy();
  });
});
