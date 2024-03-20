import { browser } from "@wdio/globals";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { addTearDown, dataConnectTest } from "../../utils/test_hooks";
import { QuickPick } from "../../utils/page_objects/quick_picks";
import * as vscode from "vscode";

dataConnectTest("Can deploy services", async function () {
  const workbench = await browser.getWorkbench();
  const sidebar = new FirebaseSidebar(workbench);
  const quickPicks = new QuickPick(workbench);

  await sidebar.open();
  await sidebar.fdcDeployElement.click();

  const servicePicks = await quickPicks
    .findQuickPicks()
    .then((picks) => picks.map((p) => p.getText()));

  expect(servicePicks).toEqual(["us-east"]);

  // TODO extract as reusable mocking utility
  await browser.executeWorkbench((vs: typeof vscode) => {
    return vs.commands.executeCommand("fdc-graphql.spy-deploy");
  });
  addTearDown(async () => {
    await browser.executeWorkbench((vs: typeof vscode) => {
      return vs.commands.executeCommand("fdc-graphql.spy-deploy", {
        reset: true,
      });
    });
  });

  await quickPicks.okElement.click();

  const connectorPicks = await quickPicks
    .findQuickPicks()
    .then((picks) => picks.map((p) => p.getText()));

  expect(connectorPicks).toEqual(["a"]);

  await quickPicks.okElement.click();

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const args = (await browser.executeWorkbench((vs: typeof vscode) => {
    return vs.commands.executeCommand("fdc-graphql.spy-deploy");
  })) as Array<Array<any>>;
  expect(args.length).toBe(1);
  expect(args[0].length).toBe(3);
  expect(args[0][0]).toEqual(["dataconnect"]);
  expect(args[0][1].project).toEqual("dart-firebase-admin");
  expect(args[0][2]).toEqual("us-east");
});
