import { browser } from "@wdio/globals";
import { openFirebaseSidebar } from "../../utils/sidebar";
import { Workbench } from "wdio-vscode-service";

async function openProject(workbench: Workbench, projectPath: string) {
  const input = await workbench.executeCommand(
    "workbench.action.files.openFolder",
  );
  await input.input$.setValue(projectPath);
  await input.confirm();

  // await explorer.openFolder(projectPath);
  // await openFirebaseSidebar(workbench);
}

it("Can execute queries", async function () {
  this.timeout(100000);

  const workbench = await browser.getWorkbench();

  await openProject(
    workbench,
    "/Users/remirousselet/dev/firebase_private/firebase-tools/firebase-vscode/src/test/test_projects/fishfood",
  );

  await openFirebaseSidebar();

  await new Promise((resolve) => setTimeout(resolve, 100000));
});
