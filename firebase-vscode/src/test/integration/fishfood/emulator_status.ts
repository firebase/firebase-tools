import { browser, expect } from "@wdio/globals";
import { StatusBar } from "../../utils/page_objects/status_bar";
import { firebaseTest } from "../../utils/test_hooks";
import { FirebaseCommands } from "../../utils/page_objects/commands";

firebaseTest(
  "If the emulator is not started, the status bar says so",
  async function () {
    const workbench = await browser.getWorkbench();
    const statusBar = new StatusBar(workbench);

    expect(await statusBar.emulatorsStatus.getText()).toContain(
      "Emulators: starting"
    );
  }
);

firebaseTest("When emulators are running, lists them", async function () {
  const workbench = await browser.getWorkbench();
  const commands = new FirebaseCommands();
  const statusBar = new StatusBar(workbench);

  await commands.waitEmulators();

  expect(await statusBar.emulatorsStatus.getText()).toContain(
    "Connected to local Postgres"
  );
});
