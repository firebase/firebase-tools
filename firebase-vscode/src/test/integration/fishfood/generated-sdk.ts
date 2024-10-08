// import { firebaseSuite, firebaseTest } from "../../utils/test_hooks";
// import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
// import { EditorView } from "../../utils/page_objects/editor";
// import { mockUser } from "../../utils/user";

// TODO this test is blocked by the native file picker which can't show up in the test environment.
// Either find a way to mock the result of the file picker or find a way to bypass it.
// However, tried to mock the file picker but it didn't work.
// firebaseSuite("Generated SDK", async function () {
//   firebaseTest(
//     "configuration should insert the correct path in the connector.yaml file",
//     async function () {
//       const workbench = await browser.getWorkbench();
//       await mockUser({ email: "test@gmail.com" });

//       const sidebar = new FirebaseSidebar(workbench);
//       await sidebar.openExtensionSidebar();
//       await browser.pause(1000);

//       await sidebar.runInStudioContext(async (config) => {
//         await config.configureGeneratedSdkBtn.waitForDisplayed();
//         await config.configureGeneratedSdkBtn.click();
//       });

//       await browser.pause(5000);

//       const editorView = new EditorView(workbench);

//       const editorContent = await editorView.activeEditorContent();
//     },
//   );
// });
