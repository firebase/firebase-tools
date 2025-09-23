import { expect } from "chai";
import * as sinon from "sinon";
import * as ensureApiEnabled from "../ensureApiEnabled";
import * as apis from "./ensureApis";
import * as api from "../api";

describe("ensureApis", () => {
  let ensureStub: sinon.SinonStub;

  beforeEach(() => {
    ensureStub = sinon.stub(ensureApiEnabled, "ensure");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("should ensure Data Connect and Cloud SQL Admin APIs are enabled", async () => {
    ensureStub.resolves();
    await apis.ensureApis("my-project");
    expect(ensureStub).to.be.calledWith("my-project", api.dataconnectOrigin(), "dataconnect");
    expect(ensureStub).to.be.calledWith("my-project", api.cloudSQLAdminOrigin(), "dataconnect");
  });

  it("should ensure Cloud AI Companion API is enabled", async () => {
    ensureStub.resolves();
    await apis.ensureGIFApis("my-project");
    expect(ensureStub).to.be.calledWith("my-project", api.cloudAiCompanionOrigin(), "dataconnect");
  });
});
