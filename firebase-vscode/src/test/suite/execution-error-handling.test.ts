import * as assert from "assert";
import * as vscode from "vscode";
import { firebaseSuite, firebaseTest } from "../utils/test_hooks";
import { stub, restore } from "sinon";
import * as gif from "../../../../src/gemini/fdcExperience";
import { dataConnectConfigs } from "../../data-connect/config";
import { ResultValue } from "../../result";
import { registerExecution } from "../../data-connect/execution/execution";
import { requireAuthWrapper } from "../../cli";
import * as auth from "../../../../src/auth";
import nock from "../../../../src/test/helpers/nock";
import { setAccessToken } from "../../../../src/apiv2";
import { googleOrigin } from "../../../../src/api";
import { configstore } from "../../../../src/configstore";

firebaseSuite(
  "generateOperation Error Handling",
  () => {
    let showErrorMessageStub: any;
    let showInformationMessageStub: any;
    let authStub: any;
    let executionDisposable: vscode.Disposable;
    let originalFirebaseToken: string | undefined;

    setup(async () => {
      nock.cleanAll();
      showErrorMessageStub = stub(vscode.window, "showErrorMessage");
      showInformationMessageStub = stub(
        vscode.window,
        "showInformationMessage",
      );
      originalFirebaseToken = process.env.FIREBASE_TOKEN;
      process.env.FIREBASE_TOKEN = "mock_refresh_token";
      nock(googleOrigin())
        .post("/oauth2/v3/token")
        .reply(200, {
          access_token: "an_access_token",
          expires_in: 3600,
        });
      await requireAuthWrapper(false);
      setAccessToken("an_access_token");

      stub(vscode.window, "withProgress").callsFake(async (options, task) => {
        return task({ report: () => {} }, {
          isCancellationRequested: false,
          onCancellationRequested: () => ({ dispose: () => {} }),
        } as any);
      });

      stub(configstore, "get").withArgs("gemini").returns(true);

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
      const broker = {
        on: () => ({ dispose: () => {} }),
        send: () => {},
      } as any;
      const dataConnectService = {
        servicePath: async () => "mock-service",
      } as any;
      const paramsService = {} as any;
      const analyticsLogger = { logger: { logUsage: () => {} } } as any;
      const emulatorsController = {
        areEmulatorsRunning: async () => true,
      } as any;

      executionDisposable = registerExecution(
        context,
        broker,
        dataConnectService,
        paramsService,
        analyticsLogger,
        emulatorsController,
      );
    });

    teardown(() => {
      if (originalFirebaseToken === undefined) {
        delete process.env.FIREBASE_TOKEN;
      } else {
        process.env.FIREBASE_TOKEN = originalFirebaseToken;
      }
      executionDisposable.dispose();
      restore();
      nock.cleanAll();
    });

    firebaseTest(
      "should show notification when response is not valid GraphQL",
      async () => {
        const scope = nock("https://firebasedataconnect.googleapis.com")
          .post(
            "/v1/projects/my-project/locations/us-central1/services/mock-service:generateQuery",
          )
          .reply(
            200,
            JSON.stringify({
              part: { textChunk: { text: "Invalid GraphQL response" } },
            }),
          );

        const document = {
          fileName: "test.gql",
          uri: vscode.Uri.parse("file:///test.gql"),
          save: stub().resolves(true),
        } as unknown as vscode.TextDocument;

        const arg = {
          projectId: "my-project",
          document,
          description: "test",
          insertPosition: 0,
          existingQuery: "",
        };

        await vscode.commands.executeCommand(
          "firebase.dataConnect.generateOperation",
          arg,
        );

        console.log(
          "showInformationMessageStub.callCount:",
          showInformationMessageStub.callCount,
        );
        if (showInformationMessageStub.callCount > 0) {
          console.log(
            "showInformationMessageStub args:",
            showInformationMessageStub.getCall(0).args,
          );
        }
        console.log(
          "showErrorMessageStub.callCount:",
          showErrorMessageStub.callCount,
        );
        if (showErrorMessageStub.callCount > 0) {
          console.log(
            "showErrorMessageStub args:",
            showErrorMessageStub.getCall(0).args,
          );
        }
        console.log("nock isDone:", scope.isDone());

        assert.ok(scope.isDone(), "Nock should have intercepted the request");
        assert.ok(showErrorMessageStub.calledOnce);
        assert.ok(
          showErrorMessageStub
            .getCall(0)
            .args[0].startsWith("Generated response is not valid GraphQL"),
        );
      },
    );
  },
  80000,
);
