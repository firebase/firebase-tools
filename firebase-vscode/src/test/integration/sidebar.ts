import { browser, expect } from "@wdio/globals";
import { Workbench } from "wdio-vscode-service";

function openFirebaseSidebar() {
  return $("a.codicon-mono-firebase").click();
}

async function switchToFirebaseSidebarFrame(workbench: Workbench) {
  const sidebarView = await workbench.getWebviewByTitle("");
  await browser.switchToFrame(sidebarView.elem);

  const firebaseView = await $('iframe[title="Firebase"]');
  await firebaseView.waitForDisplayed();
  await browser.switchToFrame(firebaseView);

  return firebaseView;
}

it("Supports opening empty projects", async function () {
  const workbench = await browser.getWorkbench();

  await openFirebaseSidebar();
  await switchToFirebaseSidebarFrame(workbench);

  await expect($("vscode-button=Try a Quickstart!")).toBeDisplayed();
});
