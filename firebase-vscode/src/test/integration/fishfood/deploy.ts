import { browser, expect } from "@wdio/globals";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { firebaseTest } from "../../utils/test_hooks";
import { QuickPick } from "../../utils/page_objects/quick_picks";
import { e2eSpy, getE2eSpyCalls } from "../mock";
firebaseTest("Can deploy services", async function () {
  const workbench = await browser.getWorkbench();
  const sidebar = new FirebaseSidebar(workbench);
  const quickPicks = new QuickPick(workbench);

  await sidebar.open();
  await sidebar.fdcDeployElement.click();

  const servicePicks = await quickPicks
    .findQuickPicks()
    .then((picks) => picks.map((p) => p.getText()));

  expect(servicePicks).toEqual(["us-east"]);

  e2eSpy("deploy");

  await quickPicks.okElement.click();

  const connectorPicks = await quickPicks
    .findQuickPicks()
    .then((picks) => picks.map((p) => p.getText()));

  expect(connectorPicks).toEqual(["a"]);

  await quickPicks.okElement.click();

  const args = await getE2eSpyCalls("deploy");

  expect(args.length).toBe(1);

  expect(args[0].length).toBe(3);
  expect(args[0][0]).toEqual(["dataconnect"]);
  expect(args[0][1].project).toEqual("dart-firebase-admin");
  expect(args[0][2]).toEqual({ context: "us-east" });
});
