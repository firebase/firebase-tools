import * as fs from "fs";
import * as path from "path";

import { firebaseTest, setup } from "../../utils/test_hooks";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { EditorView } from "../../utils/page_objects/editor";

const queriesPath = path.join(
  __dirname,
  "..",
  "..",
  "test_projects",
  "fishfood",
  "dataconnect",
  "connectors",
  "a",
  "queries.gql",
);

const queriesWithSyntaxError = fs.readFileSync(
  path.join(__dirname, "..", "queries_with_error.gql"),
);

firebaseTest("GraphQL", async function () {
  setup(() => {
    // Write the file with error at ./queries.gql
    fs.writeFileSync(queriesPath, queriesWithSyntaxError);
  });

  it("queries file with sytntax error should show the error", async function () {
    const workbench = await browser.getWorkbench();

    const editorView = new EditorView(workbench);
    await editorView.openFile(queriesPath);

    const diagnostics = await editorView.diagnoseFile(queriesPath);

    // Verify that the list of errors contains one from the FDC compiler source.
    const fdcErrors = diagnostics.filter(
      (diagnostic) => diagnostic.source === "Firebase Data Connect: Compiler",
    );

    // Check that there is at least one error.
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(fdcErrors.length).toBeGreaterThan(0);
  });

  it("FDC Explorer should list all mutations and queries", async function () {
    const workbench = await browser.getWorkbench();
    const sidebar = new FirebaseSidebar(workbench);
    await sidebar.open();
    await sidebar.focusFdcExplorer();
  });

  it("schema file should allow adding data", async function () {
    // TODO
    return;
  });

  it("schema file should allow reading data", async function () {
    // TODO
    return;
  });
});
