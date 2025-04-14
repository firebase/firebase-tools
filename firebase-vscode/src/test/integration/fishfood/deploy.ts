import { browser, expect } from "@wdio/globals";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { firebaseSuite, firebaseTest } from "../../utils/test_hooks";
import { e2eSpy, getE2eSpyCalls } from "../mock";
import { mockUser } from "../../utils/user";
import { FirebaseCommands } from "../../utils/page_objects/commands";
import { mockProject } from "../../utils/projects";

firebaseSuite("Deployment", async function () {
  firebaseTest("Can deploy services", async function () {
    const workbench = await browser.getWorkbench();

    const sidebar = new FirebaseSidebar(workbench);
    const commands = new FirebaseCommands();

    await sidebar.openExtensionSidebar();
    await commands.waitForUser();

    await mockUser({ email: "test@gmail.com" });
    await mockProject("test-project");

    await e2eSpy("deploy");

    await sidebar.startDeploy();

    const args = await getE2eSpyCalls("deploy");

    const fbBinary =
      process.env.FIREBASE_BINARY || "npx -y firebase-tools@latest";

    expect(args.length).toBe(1);
    expect(args[0].length).toBe(1);
    expect(args[0][0]).toEqual(`${fbBinary} deploy --only dataconnect`);
  });
});
