import * as assert from "assert";
import * as vscode from "vscode";
import { firebaseSuite, firebaseTest } from "../utils/test_hooks";
import { stub, restore } from "sinon";
import * as gif from "../../../../src/gemini/fdcExperience";
import { DataConnectEmulator } from "../../../../src/emulator/dataconnectEmulator";
import { dataConnectConfigs } from "../../data-connect/config";
import { ResultValue } from "../../result";
import { registerExecution } from "../../data-connect/execution/execution";
import * as ensureApis from "../../../../src/dataconnect/ensureApis";
import * as auth from "../../../../src/auth";
import * as nock from "nock";
import { setAccessToken } from "../../../../src/apiv2";

firebaseSuite("generateOperation Error Handling", () => {
  let showErrorMessageStub: any;
  let showInformationMessageStub: any;
  let buildStub: any;
  let ensureGIFApiTosStub: any;
  let authStub: any;
  let executionDisposable: vscode.Disposable;

  setup(() => {
    showErrorMessageStub = stub(vscode.window, "showErrorMessage");
    showInformationMessageStub = stub(vscode.window, "showInformationMessage");
    buildStub = stub(DataConnectEmulator, "build");
    ensureGIFApiTosStub = stub(ensureApis, "ensureGIFApiTos").resolves(true);
    authStub = stub(auth, "getAccessToken").resolves({ access_token: "an_access_token" });
    setAccessToken("an_access_token");
    
    stub(vscode.window, "withProgress").callsFake(async (options, task) => {
        return task({ report: () => {} }, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) } as any);
    });

    // Mock dataConnectConfigs
    const mockConfigs = {
        findEnclosingServiceForPath: () => ({
            path: "/mock/path",
            mainSchemaDir: "schema",
            secondarySchemaDirs: [],
        }),
    };
    dataConnectConfigs.value = new ResultValue(mockConfigs) as any;

    // Mock dependencies for registerExecution
    const context = { subscriptions: [] } as any;
    const broker = { on: () => ({ dispose: () => {} }), send: () => {} } as any;
    const dataConnectService = { servicePath: async () => "mock-service" } as any;
    const paramsService = {} as any;
    const analyticsLogger = { logger: { logUsage: () => {} } } as any;
    const emulatorsController = { areEmulatorsRunning: async () => true } as any;

    executionDisposable = registerExecution(context, broker, dataConnectService, paramsService, analyticsLogger, emulatorsController);
  
    nock.cleanAll();
  });

  teardown(() => {
    executionDisposable.dispose();
    restore();
    nock.cleanAll();
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
  });

  firebaseTest("should show notification when response is not valid GraphQL", async () => {
    buildStub.resolves({ errors: [] });
    
    const scope = nock("https://staging-firebasedataconnect.sandbox.googleapis.com")
      .post("/v1/projects/my-project/locations/us-central1/services/mock-service:generateQuery")
      .reply(200, JSON.stringify({ part: { textChunk: { text: "Invalid GraphQL response" } } }));

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

    console.log("showInformationMessageStub.callCount:", showInformationMessageStub.callCount);
    if (showInformationMessageStub.callCount > 0) {
        console.log("showInformationMessageStub args:", showInformationMessageStub.getCall(0).args);
    }
    console.log("showErrorMessageStub.callCount:", showErrorMessageStub.callCount);
    if (showErrorMessageStub.callCount > 0) {
        console.log("showErrorMessageStub args:", showErrorMessageStub.getCall(0).args);
    }
    console.log("nock isDone:", scope.isDone());

    assert.ok(scope.isDone(), "Nock should have intercepted the request");
    assert.ok(showInformationMessageStub.calledOnce);
    assert.ok(showInformationMessageStub.getCall(0).args[0].startsWith("Generated response is not valid GraphQL"));
  });
});

