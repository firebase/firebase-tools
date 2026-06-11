import * as sinon from "sinon";
import { expect } from "chai";
import { command as apptestingExecute } from "./apptesting";
import * as optionsParserUtil from "../appdistribution/options-parser-util";
import * as parseTestFilesModule from "../apptesting/parseTestFiles";
import * as fsutils from "../fsutils";
import { AppDistributionClient } from "../appdistribution/client";
import * as distributionModule from "../appdistribution/distribution";
import * as utils from "../utils";

describe("apptesting:execute", () => {
  let getLoginCredentialSpy: sinon.SinonSpy;
  let createReleaseTestStub: sinon.SinonStub;

  beforeEach(() => {
    (apptestingExecute as unknown as { befores: unknown[] }).befores = []; // Bypass requireAuth
    sinon.stub(optionsParserUtil, "getAppName").returns("projects/123/apps/1:123:android:abc");
    sinon.stub(optionsParserUtil, "getResultsBucket").returns(undefined);
    sinon.stub(optionsParserUtil, "parseTestDevices").returns([]);
    getLoginCredentialSpy = sinon.spy(optionsParserUtil, "getLoginCredential");
    sinon.stub(fsutils, "dirExistsSync").returns(true);
    sinon.stub(parseTestFilesModule, "parseTestFiles").resolves([
      {
        testCase: {
          displayName: "Login smoke test",
          steps: [{ goal: "Log in" }],
        },
        testExecution: [],
      },
    ]);
    const mockRelease = {
      name: "projects/123/apps/1:123:android:abc/releases/version1",
      displayVersion: "1.0.0",
      buildVersion: "1a",
      createTime: new Date("2026-06-11T12:00:00Z"),
      releaseNotes: { text: "Notes" },
      firebaseConsoleUri: "https://console.firebase.google.com/foo",
      testingUri: "https://testing.uri",
      binaryDownloadUri: "https://download.uri",
    };
    sinon.stub(AppDistributionClient.prototype, "getLatestRelease").resolves(mockRelease);
    createReleaseTestStub = sinon
      .stub(AppDistributionClient.prototype, "createReleaseTest")
      .resolves({
        name: "projects/123/apps/1:123:android:abc/releases/version1/tests/test1",
        deviceExecutions: [],
      });
    sinon.stub(distributionModule, "upload").resolves(mockRelease);
    sinon.stub(distributionModule, "awaitTestResults").resolves();
    sinon.stub(utils, "logBullet");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should define --test-username, --test-password, and --test-password-file options", () => {
    const optionNames = (apptestingExecute as any).options.map((opt: any) => opt[0]);
    expect(optionNames).to.include("--test-username <string>");
    expect(optionNames).to.include("--test-password <string>");
    expect(optionNames).to.include("--test-password-file <string>");
  });

  it("should call getLoginCredential with the correct arguments", async () => {
    await apptestingExecute.runner()(undefined, {
      app: "1:123:android:abc",
      testUsername: "tester@example.com",
      testPassword: "dummy-password",
      testPasswordFile: "./password.txt",
    });

    expect(getLoginCredentialSpy).to.have.been.calledWith({
      username: "tester@example.com",
      password: "dummy-password",
      passwordFile: "./password.txt",
    });
  });

  it("should pass the parsed LoginCredential to AppDistributionClient.createReleaseTest", async () => {
    await apptestingExecute.runner()(undefined, {
      app: "1:123:android:abc",
      testUsername: "tester@example.com",
      testPassword: "dummy-password",
    });

    expect(createReleaseTestStub).to.have.been.calledWith(
      "projects/123/apps/1:123:android:abc/releases/version1",
      sinon.match.any,
      sinon.match({
        loginCredential: {
          username: "tester@example.com",
          password: "dummy-password",
          fieldHints: undefined,
        },
      }),
    );
  });
});
