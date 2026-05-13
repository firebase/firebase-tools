import * as assert from "assert";
import * as vscode from "vscode";
import { firebaseSuite, firebaseTest } from "../utils/test_hooks";
import { stub, restore } from "sinon";
import * as gif from "../../../../src/gemini/fdcExperience";
import { DataConnectEmulator } from "../../../../src/emulator/dataconnectEmulator";
import { dataConnectConfigs } from "../../data-connect/config";
import { ResultValue } from "../../result";

firebaseSuite("generateOperation Error Handling", () => {
  let showErrorMessageStub: any;
  let showInformationMessageStub: any;
  let generateOperationStub: any;
  let buildStub: any;

  setup(() => {
    showErrorMessageStub = stub(vscode.window, "showErrorMessage");
    showInformationMessageStub = stub(vscode.window, "showInformationMessage");
    generateOperationStub = stub(gif, "generateOperation");
    buildStub = stub(DataConnectEmulator, "build");
    
    // Mock dataConnectConfigs
    const mockConfigs = {
        findEnclosingServiceForPath: () => ({
            path: "/mock/path",
            mainSchemaDir: "schema",
            secondarySchemaDirs: [],
        }),
    };
    dataConnectConfigs.value = new ResultValue(mockConfigs) as any;
  });

  teardown(() => {
    restore();
  });

  firebaseTest("should show error message when build fails", async () => {
    buildStub.resolves({ errors: [{ message: "Build failed" }] });

    const document = {
        fileName: "test.gql",
        uri: vscode.Uri.parse("file:///test.gql"),
    } as vscode.TextDocument;

    const arg = {
        projectId: "my-project",
        document,
        description: "test",
        insertPosition: 0,
        existingQuery: "",
    };

    await vscode.commands.executeCommand("firebase.dataConnect.generateOperation", arg);

    assert.ok(showErrorMessageStub.calledOnce);
    assert.equal(showErrorMessageStub.getCall(0).args[0], "Ensure schema compiles before generating queries");
    assert.ok(generateOperationStub.notCalled);
  });

  firebaseTest("should show notification when response is not valid GraphQL", async () => {
    buildStub.resolves({ errors: [] });
    generateOperationStub.resolves("Invalid GraphQL response");

    const document = {
        fileName: "test.gql",
        uri: vscode.Uri.parse("file:///test.gql"),
    } as vscode.TextDocument;

    const arg = {
        projectId: "my-project",
        document,
        description: "test",
        insertPosition: 0,
        existingQuery: "",
    };

    await vscode.commands.executeCommand("firebase.dataConnect.generateOperation", arg);

    assert.ok(showInformationMessageStub.calledOnce);
    assert.ok(showInformationMessageStub.getCall(0).args[0].startsWith("Generated response is not valid GraphQL"));
  });
});
