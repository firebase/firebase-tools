import { expect } from "chai";
import { configstore } from "../../configstore";
import * as sinon from "sinon";

import * as envstore from "../../functions/envstore";
import * as ensureEnv from "../../functions/ensureEnv";

describe("check", () => {
  const projectId = "project-id";
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let fakeConfigStore: { [key: string]: any } = {};
  let getStore: sinon.SinonStub;
  let configstoreGetStub: sinon.SinonStub;

  beforeEach(() => {
    configstoreGetStub = sandbox.stub(configstore, "get");
    configstoreGetStub.callsFake((key: string) => {
      return fakeConfigStore[key];
    });

    const configstoreSetStub = sandbox.stub(configstore, "set");
    configstoreSetStub.callsFake((...args: any) => {
      fakeConfigStore[args[0]] = args[1];
    });

    const configstoreDeleteStub = sandbox.stub(configstore, "delete");
    configstoreDeleteStub.callsFake((key: string) => {
      delete fakeConfigStore[key];
    });

    getStore = sandbox.stub(envstore, "getStore").rejects("Unexpected call");
  });

  afterEach(() => {
    fakeConfigStore = {};
    sandbox.restore();
  });

  it("calls EnvStore API if not active", async () => {
    getStore.onFirstCall().resolves({});

    const checkResult = await ensureEnv.check(projectId);

    expect(checkResult).to.be.false;
    expect(getStore).to.have.been.calledOnce;
  });

  it("calls EnvStore API (and caches state) if active", async () => {
    getStore.onFirstCall().resolves({ vars: { ENABLED: "1" } });

    const checkResult = await ensureEnv.check(projectId);

    expect(checkResult).to.be.true;
    expect(getStore).to.have.been.calledOnce;
  });

  it("uses cached result on subsequent calls", async () => {
    getStore.onFirstCall().resolves({ vars: { ENABLED: "1" } });

    const checkResult0 = await ensureEnv.check(projectId);
    const checkResult1 = await ensureEnv.check(projectId);

    expect(checkResult0).to.be.true;
    expect(checkResult1).to.be.true;
    expect(getStore).to.have.been.calledOnce;
  });

  it("calls EnvStore API if cached result has expired", async () => {
    const expiredTime = Date.now() - 1000 * 60 * 60 * 48; /* 2 days */
    configstoreGetStub.returns({ lastActiveAt: expiredTime });
    getStore.onFirstCall().resolves({ vars: { ENABLED: "1" } });

    const checkResult = await ensureEnv.check(projectId);

    expect(checkResult).to.be.true;
    expect(getStore).to.have.been.calledOnce;
  });
});
