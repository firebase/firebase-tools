import { StatusBar } from "../../utils/page_objects/status_bar";
import { firebaseTest } from "../../utils/test_hooks";
import { FirebaseCommands } from "../../utils/page_objects/commands";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";

firebaseTest(
  "Clicking on `Start emulators` reflects the task state in the status bar",
  async function () {
    const workbench = await browser.getWorkbench();

    const sidebar = new FirebaseSidebar(workbench);

    await sidebar.open();
    // TODO remove this
    await browser.pause(1000);

    await sidebar.runInConfigContext(async (config) => {
      await config.startEmulatorsBtn.waitForDisplayed();
      await config.startEmulatorsBtn.click();
    });

    console.log("Waiting for emulators to start");

    const commands = new FirebaseCommands();
    let emualtors = await commands.findRunningEmulators();
    console.log(emualtors);

    // Wait for the emulators to be started
    while (emualtors?.status !== "running") {
      emualtors = await commands.findRunningEmulators();
      await browser.pause(1000);
    }

    // const statusBar = new StatusBar(workbench);

    // // Wait for the emulators to be started
    // await statusBar.emulatorsStatus.waitForDisplayed();

    // expect(await statusBar.emulatorsStatus.getText()).toContain(
    //   "Connected to local Postgres",
    // );
  },
);
