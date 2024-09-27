import { firebaseTest, setup } from "../../utils/test_hooks";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { EditorView } from "../../utils/page_objects/editor";
import { mockUser } from "../../utils/user";

firebaseTest("Generated SDK", async function () {
  it("configuration should insert the correct path in the connector.yaml file", async function () {
    const workbench = await browser.getWorkbench();
    await mockUser({ email: "test@gmail.com" });

    const sidebar = new FirebaseSidebar(workbench);
    await sidebar.openExtensionSidebar();
    await browser.pause(1000);

    await sidebar.runInStudioContext(async (config) => {
      await config.configureGeneratedSdkBtn.waitForDisplayed();
      await config.configureGeneratedSdkBtn.click();
    });

    await browser.pause(5000);

    const editorView = new EditorView(workbench);
    // await editorView.openFile(
    //   path.join(
    //     __dirname,
    //     "..",
    //     "..",
    //     "test_projects",
    //     "fishfood",
    //     "dataconnect",
    //     "connectors",
    //     "a",
    //     "connector.yaml",
    //   ),
    // );

    const editorContent = await editorView.activeEditorContent();
  });
});
