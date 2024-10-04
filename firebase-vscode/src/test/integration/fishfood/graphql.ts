import * as fs from "fs";
import * as path from "path";

import {
  addTearDown,
  firebaseSuite,
  firebaseTest,
  addSetup,
} from "../../utils/test_hooks";
import {
  SchemaExplorerView,
  FirebaseSidebar,
} from "../../utils/page_objects/sidebar";
import { EditorView } from "../../utils/page_objects/editor";
import { mockUser } from "../../utils/user";
import { mockProject } from "../../utils/projects";
import { FirebaseCommands } from "../../utils/page_objects/commands";

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

addSetup(() => {
  const queriesWithSyntaxError = fs.readFileSync(
    path.join(__dirname, "..", "queries_with_error.gql"),
  );
  // Write the file with error at ./queries.gql
  fs.writeFileSync(queriesPath, queriesWithSyntaxError);
});

addTearDown(() => {
  const originalQueries = fs.readFileSync(queriesPath);
  // Delete the file with error at ./queries.gql
  fs.writeFileSync(queriesPath, originalQueries);
});

firebaseSuite("GraphQL", async function () {
  firebaseTest(
    "GraphQL queries file with sytntax error should show the error",
    async function () {
      const workbench = await browser.getWorkbench();

      const sidebar = new FirebaseSidebar(workbench);
      await sidebar.openExtensionSidebar();

      const commands = new FirebaseCommands();
      await commands.waitForUser();

      await mockUser({ email: "test@gmail.com" });
      await mockProject("test-project");

      const editorView = new EditorView(workbench);
      await editorView.openFile(queriesPath);

      let diagnostics = await editorView.diagnoseFile(queriesPath);

      await browser.waitUntil(
        async () => {
          diagnostics = await editorView.diagnoseFile(queriesPath);
          return diagnostics.length > 1;
        },
        { timeout: 120000 },
      );

      // Verify that the list of errors contains one from the FDC compiler source.
      const fdcErrors = diagnostics.filter(
        (diagnostic) => diagnostic.source === "Firebase Data Connect: Compiler",
      );

      // Check that there is at least one error.
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(fdcErrors.length).toBeGreaterThan(0);
    },
  );

  firebaseTest(
    "FDC Explorer should list all mutations and queries",
    async function () {
      const workbench = await browser.getWorkbench();

      const sidebar = new FirebaseSidebar(workbench);
      await sidebar.openExtensionSidebar();

      const fdcView = new SchemaExplorerView(workbench);
      await fdcView.focusFdcExplorer();

      // Wait for the TreeView to load and its nodes to be displayed
      await fdcView.waitForData();

      const queries = await fdcView.getQueries();
      const mutations = await fdcView.getMutations();

      // Verify that the queries and mutations are displayed
      expect(queries.length).toBe(5);
      expect(mutations.length).toBe(4);
    },
  );

  firebaseTest(
    "GraphQL schema file should allow adding/reading data",
    async function () {
      const workbench = await browser.getWorkbench();

      const sidebar = new FirebaseSidebar(workbench);
      await sidebar.openExtensionSidebar();

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
      await browser.pause(1500);

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

      await editorView.closeCurrentEditor();

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
    },
  );
});