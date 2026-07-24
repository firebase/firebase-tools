import { expect } from "chai";
import * as sinon from "sinon";
import { implicitInit } from "./implicitInit";
import * as fetchWebSetupModule from "../fetchWebSetup";
import * as templatesModule from "../templates";
import { EmulatorRegistry } from "../emulator/registry";
import { Emulators } from "../emulator/types";
import * as utils from "../utils";

describe("hosting/implicitInit", () => {
  let fetchWebSetupStub: sinon.SinonStub;
  let getCachedWebSetupStub: sinon.SinonStub;
  let readTemplateStub: sinon.SinonStub;
  let getInfoStub: sinon.SinonStub;
  let urlStub: sinon.SinonStub;
  let logWarningStub: sinon.SinonStub;

  beforeEach(() => {
    fetchWebSetupStub = sinon.stub(fetchWebSetupModule, "fetchWebSetup");
    getCachedWebSetupStub = sinon.stub(fetchWebSetupModule, "getCachedWebSetup");
    readTemplateStub = sinon.stub(templatesModule, "readTemplateSync").returns(
      "/*--CONFIG--*/\n/*--EMULATORS--*/"
    );
    getInfoStub = sinon.stub(EmulatorRegistry, "getInfo");
    urlStub = sinon.stub(EmulatorRegistry, "url");
    logWarningStub = sinon.stub(utils, "logLabeledWarning");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should successfully initialize with direct configuration", async () => {
    const mockConfig = { appId: "my-app" };
    fetchWebSetupStub.resolves(mockConfig);

    const res = await implicitInit({});

    expect(res.json).to.include('"appId": "my-app"');
    expect(res.js).to.include("var firebaseConfig = {\n  \"appId\": \"my-app\"\n}");
    expect(res.js).to.include("var firebaseEmulators = undefined");
  });

  it("should fallback to cache if fetch fails with 403", async () => {
    const err: any = new Error("Auth failed");
    err.context = { response: { statusCode: 403 } };
    fetchWebSetupStub.rejects(err);
    getCachedWebSetupStub.returns({ appId: "cached-app" });

    const res = await implicitInit({});

    expect(logWarningStub).to.have.been.calledWithMatch("hosting", /Authentication error/);
    expect(res.json).to.include('"appId": "cached-app"');
  });

  it("should log warning when absolutely no config is available", async () => {
    fetchWebSetupStub.rejects(new Error("Network off"));
    getCachedWebSetupStub.returns(undefined);

    const res = await implicitInit({});

    expect(logWarningStub).to.have.been.calledWithMatch(
      "hosting",
      /Could not fetch web app configuration/
    );
    expect(res.json).to.equal(undefined);
  });

  it("should populate emulators list when active", async () => {
    fetchWebSetupStub.resolves({ appId: "app" });
    getInfoStub.withArgs(Emulators.FIRESTORE).returns({ host: "localhost", port: 8080 });
    urlStub.withArgs(Emulators.FIRESTORE).returns({ host: "localhost:8080" });

    const res = await implicitInit({});

    expect(res.emulatorsJs).to.include('"host": "localhost"');
    expect(res.emulatorsJs).to.include('"port": 8080');
  });
});
