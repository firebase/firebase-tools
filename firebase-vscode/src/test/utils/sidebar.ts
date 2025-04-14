import { Workbench } from "wdio-vscode-service";

export function openFirebaseSidebar() {
  return $("a.codicon-mono-firebase").click();
}

export async function switchToFirebaseSidebarFrame(workbench: Workbench) {
  const sidebarView = await workbench.getWebviewByTitle("");
  await browser.switchToFrame(sidebarView.elem);

  const firebaseView = await $('iframe[title="Firebase"]');
  await firebaseView.waitForDisplayed();
  await browser.switchToFrame(firebaseView);

  return firebaseView;
}
