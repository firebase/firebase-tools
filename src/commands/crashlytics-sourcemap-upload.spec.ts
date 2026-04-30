import * as chai from "chai";
import * as sinon from "sinon";

import { command } from "./crashlytics-sourcemap-upload";
import * as gcs from "../gcp/storage";
import * as projectUtils from "../projectUtils";
import * as getProjectNumber from "../getProjectNumber";
import { FirebaseError } from "../error";
import * as childProcess from "child_process";
import * as utils from "../utils";
import { Client } from "../apiv2";
import * as requireAuthModule from "../requireAuth";

const expect = chai.expect;

const PROJECT_ID = "test-project";
const PROJECT_NUMBER = "12345";
const BUCKET_NAME = "test-bucket";
const DIR_PATH = "src/test/fixtures/mapping-files";
const DIR_WITH_JS_PATH = "src/test/fixtures/mapping-files-with-js";
const FILE_PATH = "src/test/fixtures/mapping-files/mock_mapping.js.map";

describe("crashlytics:sourcemap:upload", () => {
  let sandbox: sinon.SinonSandbox;
  let gcsMock: sinon.SinonStubbedInstance<typeof gcs>;
  let projectUtilsMock: sinon.SinonStubbedInstance<typeof projectUtils>;
  let getProjectNumberMock: sinon.SinonStubbedInstance<typeof getProjectNumber>;
  let execSyncStub: sinon.SinonStub;
  let commandExistsSyncStub: sinon.SinonStub;
  let clientPatchStub: sinon.SinonStub;
  let logLabeledWarningStub: sinon.SinonStub;
  let logLabeledBulletStub: sinon.SinonStub;
  let requireAuthMock: sinon.SinonStubbedInstance<typeof requireAuthModule>;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    requireAuthMock = sandbox.stub(requireAuthModule);
    gcsMock = sandbox.stub(gcs);
    projectUtilsMock = sandbox.stub(projectUtils);
    getProjectNumberMock = sandbox.stub(getProjectNumber);

    requireAuthMock.requireAuth.resolves("a@b.com");
    projectUtilsMock.needProjectId.returns(PROJECT_ID);
    getProjectNumberMock.getProjectNumber.resolves(PROJECT_NUMBER);
    gcsMock.upsertBucket.resolves(BUCKET_NAME);
    gcsMock.uploadObject.resolves({
      bucket: BUCKET_NAME,
      object: "test-object",
      generation: "1",
    });
    execSyncStub = sandbox.stub(childProcess, "execSync");
    commandExistsSyncStub = sandbox.stub(utils, "commandExistsSync");
    logLabeledWarningStub = sandbox.stub(utils, "logLabeledWarning");
    logLabeledBulletStub = sandbox.stub(utils, "logLabeledBullet");
    // Default to git working
    commandExistsSyncStub.withArgs("git").returns(true);
    execSyncStub.withArgs("git rev-parse HEAD").returns(Buffer.from("a".repeat(40)));
    clientPatchStub = sandbox.stub(Client.prototype, "patch").resolves({
      status: 200,
      response: {} as any,
      body: {},
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should throw an error if no app ID is provided", async () => {
    await expect(command.runner()("filename", {})).to.be.rejectedWith(
      FirebaseError,
      "set --app <appId> to a valid Firebase application id",
    );
  });

  it("should create the default cloud storage bucket", async () => {
    await command.runner()(FILE_PATH, {
      app: "test-app",
    });
    expect(gcsMock.upsertBucket).to.be.calledOnce;
    const args = gcsMock.upsertBucket.firstCall.args;
    expect(args[0].req.baseName).to.equal("firebasecrashlytics-sourcemaps-12345-us-central1");
    expect(args[0].req.location).to.equal("US-CENTRAL1");
  });

  it("should create a custom cloud storage bucket", async () => {
    const options = {
      app: "test-app",
      bucketLocation: "a-different-LoCaTiOn",
    };
    await command.runner()(FILE_PATH, options);
    expect(gcsMock.upsertBucket).to.be.calledOnce;
    const args = gcsMock.upsertBucket.firstCall.args;
    expect(args[0].req.baseName).to.equal(
      "firebasecrashlytics-sourcemaps-12345-a-different-location",
    );
    expect(args[0].req.location).to.equal("A-DIFFERENT-LOCATION");
  });

  it("should throw an error if the mapping file path is invalid", async () => {
    expect(
      command.runner()("invalid/path", {
        app: "test-app",
      }),
    ).to.be.rejectedWith(FirebaseError, "provide a valid file path or directory");
  });

  it("should upload a single mapping file", async () => {
    await command.runner()(FILE_PATH, {
      app: "test-app",
    });
    expect(gcsMock.uploadObject).to.be.calledOnce;
    expect(gcsMock.uploadObject).to.be.calledWith(sinon.match.any, BUCKET_NAME);
    expect(gcsMock.uploadObject.firstCall.args[0].file).to.match(
      /test-app-.*-src-test-fixtures-mapping-files-mock_mapping\.js\.map\.zip/,
    );
  });

  it("should find and upload mapping files in a directory", async () => {
    await command.runner()(DIR_PATH, { app: "test-app" });
    expect(gcsMock.uploadObject).to.be.calledTwice;
    const uploadedFiles = gcsMock.uploadObject
      .getCalls()
      .map((call) => call.args[0].file)
      .sort();
    expect(uploadedFiles[0]).to.match(
      /test-app-.*-src-test-fixtures-mapping-files-mock_mapping\.js\.map\.zip/,
    );
    expect(uploadedFiles[1]).to.match(
      /test-app-.*-src-test-fixtures-mapping-files-subdir-subdir_mock_mapping\.js\.map\.zip/,
    );
  });

  it("should find and upload mapping files in the current directory if no path is provided", async () => {
    const originalCwd = process.cwd();
    try {
      process.chdir("src/test");
      await command.runner()(undefined, { app: "test-app" });
      const uploadedFiles = gcsMock.uploadObject
        .getCalls()
        .map((call) => call.args[0].file)
        .sort();
      expect(uploadedFiles[0]).to.match(
        /test-app-.*-fixtures-mapping-files-mock_mapping\.js\.map\.zip/,
      );
      expect(uploadedFiles[1]).to.match(
        /test-app-.*-fixtures-mapping-files-subdir-subdir_mock_mapping\.js\.map\.zip/,
      );
      expect(uploadedFiles[2]).to.match(/test-app-.*-fixtures-mapping-files-with-js-main\.js\.zip/);
      expect(uploadedFiles[3]).to.match(
        /test-app-.*-fixtures-mapping-files-with-js-other\.js\.map\.zip/,
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("should find obfuscated mapping files linked by sourceMappingURL in a directory", async () => {
    await command.runner()(DIR_WITH_JS_PATH, {
      app: "test-app",
    });
    expect(gcsMock.uploadObject).to.be.calledTwice;
    const uploadedFiles = gcsMock.uploadObject
      .getCalls()
      .map((call) => call.args[0].file)
      .sort();

    // The zip name is based on the obfuscated path, so the first one is the "main.js.map" pretending to be the name
    expect(uploadedFiles[0]).to.match(
      /test-app-.*-src-test-fixtures-mapping-files-with-js-main\.js\.zip/,
    );
    expect(uploadedFiles[1]).to.match(
      /test-app-.*-src-test-fixtures-mapping-files-with-js-other\.js\.map\.zip/,
    );

    expect(clientPatchStub).to.be.calledTwice;
    const apiPayloads = clientPatchStub
      .getCalls()
      .map((call) => call.args[1].obfuscatedFilePath)
      .sort();

    expect(apiPayloads[0]).to.equal("/src/test/fixtures/mapping-files-with-js/main.js");
    expect(apiPayloads[1]).to.equal("/src/test/fixtures/mapping-files-with-js/other.js.map");
  });

  it("should use the provided app version", async () => {
    await command.runner()(FILE_PATH, {
      app: "test-app",
      appVersion: "1.0.0",
    });
    expect(gcsMock.uploadObject.firstCall.args[0].file).to.eq(
      "test-app-1.0.0-src-test-fixtures-mapping-files-mock_mapping.js.map.zip",
    );
  });

  it("should fall back to the git commit for app version", async () => {
    await command.runner()(FILE_PATH, {
      app: "test-app",
    });
    expect(gcsMock.uploadObject.firstCall.args[0].file).to.match(
      /test-app-a{40}-src-test-fixtures-mapping-files-mock_mapping.js.map.zip/,
    );
  });

  it("should fall back to the package version for app version", async () => {
    commandExistsSyncStub.withArgs("git").returns(true);
    execSyncStub.withArgs("git rev-parse HEAD").throws(new Error("git failed"));
    commandExistsSyncStub.withArgs("npm").returns(true);
    execSyncStub.withArgs("npm pkg get version").returns(Buffer.from("1.2.3"));

    await command.runner()(FILE_PATH, {
      app: "test-app",
    });
    expect(gcsMock.uploadObject.firstCall.args[0].file).to.eq(
      "test-app-1.2.3-src-test-fixtures-mapping-files-mock_mapping.js.map.zip",
    );
  });

  it("should fall back to the 'unset' for app version", async () => {
    commandExistsSyncStub.withArgs("git").returns(false);
    commandExistsSyncStub.withArgs("npm").returns(false);

    await command.runner()(FILE_PATH, {
      app: "test-app",
    });
    expect(gcsMock.uploadObject.firstCall.args[0].file).to.eq(
      "test-app-unset-src-test-fixtures-mapping-files-mock_mapping.js.map.zip",
    );
  });

  it("should register the source map after upload", async () => {
    await command.runner()(FILE_PATH, {
      app: "test-app",
    });
    expect(clientPatchStub).to.be.calledOnce;
    const args = clientPatchStub.firstCall.args;
    expect(args[0]).to.match(/projects\/test-project\/locations\/global\/mappingFiles\/2906062618/);
    expect(args[1]).to.deep.equal({
      name: "projects/test-project/locations/global/mappingFiles/2906062618",
      appId: "test-app",
      version: "a".repeat(40),
      obfuscatedFilePath: "/src/test/fixtures/mapping-files/mock_mapping.js.map",
      fileUri: `gs://${BUCKET_NAME}/test-object`,
    });
    expect(args[2].queryParams).to.deep.equal({ allowMissing: "true" });
  });

  it("should warn if registration fails", async () => {
    clientPatchStub.rejects(new Error("Registration failed"));
    await command.runner()(FILE_PATH, {
      app: "test-app",
    });
    expect(clientPatchStub).to.be.calledOnce;
    expect(logLabeledWarningStub).to.be.calledOnceWith(
      "crashlytics",
      sinon.match(/Failed to upload mapping file/),
    );
  });

  it("should log failed files", async () => {
    clientPatchStub.rejects(new Error("Registration failed"));
    await command.runner()(DIR_PATH, { app: "test-app", retryDelay: 10 });

    // Should verify that logLabeledBullet is called with the specific failed files
    expect(logLabeledBulletStub).to.be.calledWith(
      "crashlytics",
      sinon.match(/Could not upload the following files:/),
    );
    expect(logLabeledBulletStub).to.be.calledWith(
      "crashlytics",
      sinon.match(/subdir_mock_mapping\.js\.map/),
    );
    expect(logLabeledBulletStub).to.be.calledWith(
      "crashlytics",
      sinon.match(/mock_mapping\.js\.map/),
    );
  });
});
