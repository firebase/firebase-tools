import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
import { command } from "./apphosting-backends-create";
import * as backend from "../apphosting/backend";
import * as projectUtils from "../projectUtils";
import * as requireAuthModule from "../requireAuth";
import { FirebaseError } from "../error";

describe("apphosting:backends:create", () => {
  const PROJECT_ID = "test-project";
  const WEB_APP_ID = "test-web-app";
  const BACKEND_ID = "test-backend";
  const REGION = "us-central1";
  const SERVICE_ACCOUNT = "test-sa";
  const ROOT_DIR = ".";

  let doSetupStub: sinon.SinonStub;

  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    doSetupStub = sinon.stub(backend, "doSetup").resolves();
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    sinon.stub(requireAuthModule, "requireAuth").resolves();

    // Stub ensureApiEnabled calls
    nock("https://serviceusage.googleapis.com")
      .get(`/v1/projects/${PROJECT_ID}/services/firebaseapphosting.googleapis.com`)
      .query(true) // match any query params
      .reply(200, { state: "ENABLED" });

    // Stub TOS acceptance check
    nock("https://mobilesdk-pa.googleapis.com")
      .get("/v1/accessmanagement/tos:getStatus")
      .query(true)
      .reply(200, {
        perServiceStatus: [
          {
            tosId: "APP_HOSTING_TOS",
            serviceStatus: {
              status: "ACCEPTED",
            },
          },
        ],
      });
  });

  afterEach(() => {
    sinon.restore();
    nock.cleanAll();
  });

  [
    {
      description: "missing required options",
      options: { nonInteractive: true },
    },
    {
      description: "just backend provided",
      options: { nonInteractive: true, backend: BACKEND_ID },
    },
    {
      description: "just region provided",
      options: { nonInteractive: true, primaryRegion: REGION },
    },
  ].forEach(({ description, options }) => {
    it(`should throw error if non-interactive and ${description}`, async () => {
      await expect(command.runner()(options)).to.be.rejectedWith(
        FirebaseError,
        "requires --backend and --primary-region",
      );
    });
  });

  it("should call doSetup with correct arguments in interactive mode", async () => {
    before(() => {
      sinon.stub(process.stdin, "isTTY").value(true);
    });
    const options = {};
    await command.runner()(options);

    expect(doSetupStub).to.have.been.calledWith(
      PROJECT_ID,
      undefined, // nonInteractive
      undefined, // webAppId
      undefined, // backendId
      undefined, // serviceAccount
      undefined, // primaryRegion
      undefined, // rootDir
    );
  });

  it("should call doSetup with passed options in non-interactive mode", async () => {
    const options = {
      nonInteractive: true,
      backend: BACKEND_ID,
      primaryRegion: REGION,
      app: WEB_APP_ID,
      serviceAccount: SERVICE_ACCOUNT,
      rootDir: ROOT_DIR,
    };
    await command.runner()(options);

    expect(doSetupStub).to.have.been.calledWith(
      PROJECT_ID,
      true,
      WEB_APP_ID,
      BACKEND_ID,
      SERVICE_ACCOUNT,
      REGION,
      ROOT_DIR,
    );
  });
});
