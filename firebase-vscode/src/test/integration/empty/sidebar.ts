import { browser } from "@wdio/globals";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { getCommandsSpyCalls, spyCommands } from "../mock";

// it("Supports opening empty projects", async function () {
//   const workbench = await browser.getWorkbench();
//   const sidebar = new FirebaseSidebar(workbench);

//   await sidebar.open();

//   await sidebar.runInFirebaseViewContext(async (firebase) => {
//     await firebase.connectProjectLinkElement.waitForDisplayed();
//   });
// });

it("Supports `open folder` button", async () => {
  const workbench = await browser.getWorkbench();
  const sidebar = new FirebaseSidebar(workbench);

  await sidebar.open();

  await spyCommands();

  await sidebar.runInFirebaseViewContext(async (firebase) => {
    await firebase.openFolderElement.waitForDisplayed();
    await firebase.openFolderElement.click();

    const calls = await getCommandsSpyCalls();

    console.log('calls', calls);

    expect(calls).toEqual([["workbench.action.files.openFolder"]]);
  });
});
