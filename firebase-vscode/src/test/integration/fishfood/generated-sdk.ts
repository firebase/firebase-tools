// import * as fs from "fs";
// import * as path from "path";
// import vscode from "vscode";
// import sinon from "sinon";

// import { firebaseTest, setup } from "../../utils/test_hooks";
// import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
// import { EditorView } from "../../utils/page_objects/editor";

// firebaseTest("Generated SDK", async function () {
//   it("configuration should insert the correct path in the connector.yaml file", async function () {
//     const workbench = await browser.getWorkbench();

//     const sidebar = new FirebaseSidebar(workbench);
//     await sidebar.open();
//     await browser.pause(1000);

//     await sidebar.runInConfigContext(async (config) => {
//       await config.configureGeneratedSdkBtn.waitForDisplayed();
//       await config.configureGeneratedSdkBtn.click();
//     });

//     await browser.pause(5000);

//     const editorView = new EditorView(workbench);
//     // await editorView.openFile(
//     //   path.join(
//     //     __dirname,
//     //     "..",
//     //     "..",
//     //     "test_projects",
//     //     "fishfood",
//     //     "dataconnect",
//     //     "connectors",
//     //     "a",
//     //     "connector.yaml",
//     //   ),
//     // );

//     const editorContent = await editorView.activeEditorContent();
//   });
// });
