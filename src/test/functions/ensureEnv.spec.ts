import { expect } from "chai";
import { configstore } from "../../configstore";
import * as sinon from "sinon";

import * as backend from "../../deploy/functions/backend";
import * as deploymentTool from "../../deploymentTool";
import * as ensureEnv from "../../functions/ensureEnv";
import * as envstore from "../../functions/envstore";

describe("check", () => {
  const projectId = "project-id";
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let fakeConfigStore: { [key: string]: any } = {};
  let getStore: sinon.SinonStub;

  beforeEach(() => {
    const configstoreGetStub = sandbox.stub(configstore, "get");
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

    const checkResult = await ensureEnv.checkEnvStore(projectId);

    expect(checkResult).to.be.false;
    expect(getStore).to.have.been.calledOnce;
  });

  it("calls EnvStore API (and caches state) if active", async () => {
    getStore.onFirstCall().resolves({ vars: { ENABLED: "1" } });

    const checkResult = await ensureEnv.checkEnvStore(projectId);

    expect(checkResult).to.be.true;
    expect(getStore).to.have.been.calledOnce;
  });

  it("uses cached result on subsequent calls", async () => {
    getStore.onFirstCall().resolves({ vars: { ENABLED: "1" } });

    const checkResult0 = await ensureEnv.checkEnvStore(projectId);
    const checkResult1 = await ensureEnv.checkEnvStore(projectId);

    expect(checkResult0).to.be.true;
    expect(checkResult1).to.be.true;
    expect(getStore).to.have.been.calledOnce;
  });

  it("calls EnvStore API if cached result has expired", async () => {
    const expiredTime = Date.now() - 1000 * 60 * 60 * 48; // 2 days ago
    fakeConfigStore = { envstore: { lastActiveAt: expiredTime } };
    getStore.onFirstCall().resolves({ vars: { ENABLED: "1" } });

    const checkResult = await ensureEnv.checkEnvStore(projectId);

    expect(checkResult).to.be.true;
    expect(getStore).to.have.been.calledOnce;
  });
});

describe.only("getUserEnvs", () => {
  let existingBackendStub: sinon.SinonStub;

  const FUNCTION_SPEC: backend.FunctionSpec = {
    id: "id",
    region: "region",
    project: "project",
    apiVersion: 1,
    trigger: {
      allowInsecure: false,
    },
    entryPoint: "function",
    runtime: "nodejs14",
  };

  beforeEach(() => {
    existingBackendStub = sinon.stub(backend, "existingBackend").rejects("Unexpected call");
  });

  afterEach(() => {
    existingBackendStub.restore();
  });

  it("picks fns with user env vars", async () => {
    const testBackend: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...FUNCTION_SPEC,
          id: "fn1",
          region: "region1",
          labels: { "deployment-tool": deploymentTool.BASE },
          environmentVariables: {
            FIREBASE_CONFIG: "foobar",
            FOO: "foo",
          },
        },
        {
          ...FUNCTION_SPEC,
          id: "fn2",
          region: "region1",
          labels: { "deployment-tool": deploymentTool.BASE },
          environmentVariables: {
            FIREBASE_CONFIG: "foobar",
          },
        },
        {
          ...FUNCTION_SPEC,
          id: "fn3",
          region: "region1",
          labels: { "deployment-tool": deploymentTool.BASE },
          environmentVariables: {
            FIREBASE_CONFIG: "foobar",
            BAR: "bar",
          },
        },
      ],
    };
    existingBackendStub.resolves(testBackend);

    const envs = await ensureEnv.getUserEnvs("project");

    expect(envs).to.deep.equal({
      "fn1(region1)": { FOO: "foo" },
      "fn3(region1)": { BAR: "bar" },
    });
  });

  it("ignores fns not managed by Firebase", async () => {
    const testBackend: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...FUNCTION_SPEC,
          id: "fn1",
          region: "region1",
          labels: { "deployment-tool": "firebase-extension" },
          environmentVariables: {
            FIREBASE_CONFIG: "foobar",
            FOO: "foo",
          },
        },
        {
          ...FUNCTION_SPEC,
          id: "fn2",
          region: "region1",
          labels: { "deployment-tool": "pantheon" },
          environmentVariables: {
            FIREBASE_CONFIG: "foobar",
            BAR: "bar",
          },
        },
      ],
    };
    existingBackendStub.resolves(testBackend);

    const envs = await ensureEnv.getUserEnvs("project");

    expect(envs).to.deep.equal({});
  });
});
