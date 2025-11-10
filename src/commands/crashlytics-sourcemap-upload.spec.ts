import * as chai from "chai";
import * as sinon from "sinon";

import { command } from "./crashlytics-sourcemap-upload";
import * as gcs from "../gcp/storage";
import * as projectUtils from "../projectUtils";
import * as getProjectNumber from "../getProjectNumber";
import { FirebaseError } from "../error";

const expect = chai.expect;

const PROJECT_ID = "test-project";
const PROJECT_NUMBER = "12345";
const BUCKET_NAME = "test-bucket";
const DIR_PATH = "mockdata";
const FILE_PATH = "mockdata/mock_mapping.js.map";

describe("crashlytics:sourcemap:upload", () => {
  let sandbox: sinon.SinonSandbox;
  let gcsMock: sinon.SinonStubbedInstance<typeof gcs>;
  let projectUtilsMock: sinon.SinonStubbedInstance<typeof projectUtils>;
  let getProjectNumberMock: sinon.SinonStubbedInstance<typeof getProjectNumber>;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    gcsMock = sandbox.stub(gcs);
    projectUtilsMock = sandbox.stub(projectUtils);
    getProjectNumberMock = sandbox.stub(getProjectNumber);

    projectUtilsMock.needProjectId.returns(PROJECT_ID);
    getProjectNumberMock.getProjectNumber.resolves(PROJECT_NUMBER);
    gcsMock.upsertBucket.resolves(BUCKET_NAME);
    gcsMock.uploadObject.resolves({
      bucket: BUCKET_NAME,
      object: "test-object",
      generation: "1",
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should throw an error if no app ID is provided", async () => {
    await expect(command.runner()('filename', {})).to.be.rejectedWith(
      FirebaseError,
      "set --app <appId> to a valid Firebase application id"
    );
  });

  it("should create the default cloud storage bucket", async () => {
    await command.runner()(FILE_PATH, { app: "test-app" });
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
    expect(args[0].req.baseName).to.equal("firebasecrashlytics-sourcemaps-12345-a-different-location");
    expect(args[0].req.location).to.equal("A-DIFFERENT-LOCATION");
  });

  it("should throw an error if the mapping file path is invalid", async () => {
    expect(
      command.runner()("invalid/path", { app: "test-app" })
    ).to.be.rejectedWith(FirebaseError, "provide a valid file path or directory");
  });

  it("should upload a single mapping file", async () => {
    await command.runner()(FILE_PATH, { app: "test-app" });
    expect(gcsMock.uploadObject).to.be.calledOnce;
    expect(gcsMock.uploadObject).to.be.calledWith(
      sinon.match.any,
      BUCKET_NAME,
    );
    expect(gcsMock.uploadObject.firstCall.args[0].file)
      .to.match(/test-app-default-mockdata-mock_mapping\.js\.map\.zip/);
  });

  it("should find and upload mapping files in a directory", async () => {
    await command.runner()(DIR_PATH, { app: "test-app" });
    expect(gcsMock.uploadObject).to.be.calledOnce;
    expect(gcsMock.uploadObject.firstCall.args[0].file)
      .to.match(/test-app-default-mockdata-mock_mapping\.js\.map\.zip/);
  });
});
