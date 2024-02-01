import { browser, expect } from "@wdio/globals";
import {
  openFirebaseSidebar,
  switchToFirebaseSidebarFrame,
} from "../utils/sidebar";

it("Supports opening empty projects", async function () {
  const workbench = await browser.getWorkbench();

  await openFirebaseSidebar();
  await switchToFirebaseSidebarFrame(workbench);

  await expect($("vscode-button=Try a Quickstart!")).toBeDisplayed();
});
