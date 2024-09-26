import * as fs from "fs";
import * as path from "path";

import { addTearDown, firebaseTest, setup } from "../../utils/test_hooks";
import { FDCView, FirebaseSidebar } from "../../utils/page_objects/sidebar";
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

setup(() => {
  const queriesWithSyntaxError = fs.readFileSync(
    path.join(__dirname, "..", "queries_with_error.gql"),
  );
  // Write the file with error at ./queries.gql
  fs.writeFileSync(queriesPath, queriesWithSyntaxError);
});

addTearDown(() => {
  console.log("Tearing down");
  const originalQueries = fs.readFileSync(queriesPath);
  // Delete the file with error at ./queries.gql
  fs.writeFileSync(queriesPath, originalQueries);
});

firebaseTest("GraphQL", async function () {
  it("GraphQL queries file with sytntax error should show the error", async function () {
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

    const fdcView = new FDCView(workbench);
    await fdcView.focusFdcExplorer();

    // Wait for the TreeView to load and its nodes to be displayed
    await fdcView.waitForData();

    const queries = await fdcView.getQueries();
    const mutations = await fdcView.getMutations();

    // Verify that the queries and mutations are displayed
    expect(queries.length).toBe(5);
    expect(mutations.length).toBe(4);
  });

  it("GraphQL schema file should allow adding/reading data", async function () {
    const workbench = await browser.getWorkbench();

    const schemaFilePath = path.join(
      __dirname,
      "..",
      "..",
      "test_projects",
      "fishfood",
      "dataconnect",
      "schema",
      "schema.gql",
    );

    // Open the schema file
    const editorView = new EditorView(workbench);
    await editorView.openFile(schemaFilePath);

    // Verify that inline Add Data button is displayed
    const addDataButton = await editorView.addDataButton;
    await addDataButton.waitForDisplayed();

    // Click the Add Data button
    await addDataButton.click();

    // Wait a bit for the mutation to be generated
    await browser.pause(1000);

    // Verify the generated mutation
    const activeEditor = await editorView.getActiveEditor();
    const editorTitle = activeEditor?.document.fileName.split("/").pop();
    const editorContent = await editorView.activeEditorContent();

    expect(editorContent).toHaveText(`mutation {
    post_insert(data: {
        id: "" # String
        content: "" # String
    })
}"`);
    expect(editorTitle).toBe("Post_insert.gql");

    // Verify that inline Read Data button is displayed
    const readDataButton = await editorView.readDataButton;
    await readDataButton.waitForDisplayed();

    // Click the Read Data button
    await readDataButton.click();

    // Wait a bit for the query to be generated
    await browser.pause(1000);

    // Verify the generated query
    const activeEditor2 = await editorView.getActiveEditor();
    const editorTitle2 = activeEditor2?.document.fileName.split("/").pop();
    const editorContent2 = await editorView.activeEditorContent();

    expect(editorContent2).toHaveText(`query {
  posts{
    id
    content
  }
}`);
    expect(editorTitle2).toBe("Post_read.gql");
  });
});
